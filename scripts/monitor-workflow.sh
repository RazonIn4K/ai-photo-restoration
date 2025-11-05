#!/bin/bash

# GitHub Workflow Monitor
# Polls GitHub Actions workflow status for recent commits
#
# Usage:
#   ./scripts/monitor-workflow.sh [commit_sha]
#
# Environment variables:
#   GITHUB_TOKEN - Optional, for higher rate limits (60/hr -> 5000/hr)

set -e

# Configuration
REPO_OWNER="RazonIn4K"
REPO_NAME="ai-photo-restoration"
COMMIT_SHA="${1:-$(git rev-parse HEAD)}"
POLL_INTERVAL=10  # seconds
MAX_POLLS=60      # 10 minutes total

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub API base URL
API_BASE="https://api.github.com"

# Function to make GitHub API requests
gh_api() {
    local endpoint="$1"
    local auth_header=""

    if [ -n "$GITHUB_TOKEN" ]; then
        auth_header="-H \"Authorization: Bearer $GITHUB_TOKEN\""
    fi

    eval curl -s \
        -H \"Accept: application/vnd.github+json\" \
        -H \"X-GitHub-Api-Version: 2022-11-28\" \
        $auth_header \
        "${API_BASE}${endpoint}"
}

# Get workflow runs for a commit
get_workflow_runs() {
    local commit="$1"
    gh_api "/repos/${REPO_OWNER}/${REPO_NAME}/commits/${commit}/check-runs"
}

# Get workflow run details
get_workflow_run() {
    local run_id="$1"
    gh_api "/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run_id}"
}

# Format status with color
format_status() {
    local status="$1"
    case "$status" in
        "completed")
            echo -e "${GREEN}✓ completed${NC}"
            ;;
        "in_progress"|"queued")
            echo -e "${YELLOW}⋯ ${status}${NC}"
            ;;
        "failure"|"cancelled")
            echo -e "${RED}✗ ${status}${NC}"
            ;;
        *)
            echo -e "${BLUE}${status}${NC}"
            ;;
    esac
}

# Format conclusion with color
format_conclusion() {
    local conclusion="$1"
    case "$conclusion" in
        "success")
            echo -e "${GREEN}✓ SUCCESS${NC}"
            ;;
        "failure")
            echo -e "${RED}✗ FAILURE${NC}"
            ;;
        "cancelled")
            echo -e "${YELLOW}⊘ CANCELLED${NC}"
            ;;
        "skipped")
            echo -e "${BLUE}⊸ SKIPPED${NC}"
            ;;
        "null")
            echo -e "${YELLOW}⋯ IN PROGRESS${NC}"
            ;;
        *)
            echo -e "${BLUE}${conclusion}${NC}"
            ;;
    esac
}

# Main monitoring loop
monitor_workflows() {
    local commit="$1"
    local poll_count=0

    echo -e "${BLUE}Monitoring GitHub Actions for commit: ${commit}${NC}"
    echo -e "${BLUE}Repository: ${REPO_OWNER}/${REPO_NAME}${NC}"
    echo ""

    if [ -z "$GITHUB_TOKEN" ]; then
        echo -e "${YELLOW}Note: No GITHUB_TOKEN set. Rate limit: 60 requests/hour${NC}"
        echo -e "${YELLOW}Set GITHUB_TOKEN for 5000 requests/hour${NC}"
        echo ""
    fi

    while [ $poll_count -lt $MAX_POLLS ]; do
        local response=$(get_workflow_runs "$commit")

        # Check for API errors
        if echo "$response" | grep -q '"message"'; then
            local error_msg=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
            echo -e "${RED}API Error: $error_msg${NC}"

            if echo "$response" | grep -q "rate limit"; then
                echo -e "${YELLOW}Rate limit exceeded. Set GITHUB_TOKEN to increase limit.${NC}"
                exit 1
            fi
            exit 1
        fi

        # Parse check runs
        local total_count=$(echo "$response" | grep -o '"total_count":[0-9]*' | cut -d':' -f2)

        if [ -z "$total_count" ] || [ "$total_count" -eq 0 ]; then
            echo -e "${YELLOW}No workflow runs found for this commit yet...${NC}"
            if [ $poll_count -eq 0 ]; then
                echo -e "${YELLOW}Workflows may take a moment to start. Waiting...${NC}"
            fi
        else
            clear
            echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
            echo -e "${BLUE}GitHub Actions Monitor - Poll #$((poll_count + 1))${NC}"
            echo -e "${BLUE}Commit: ${commit}${NC}"
            echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
            echo ""

            # Parse and display each check run
            local all_completed=true
            local any_failed=false

            echo "$response" | grep -o '"name":"[^"]*","status":"[^"]*","conclusion":"[^"]*"' | while IFS= read -r line; do
                local name=$(echo "$line" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
                local status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
                local conclusion=$(echo "$line" | grep -o '"conclusion":"[^"]*"' | cut -d'"' -f4)

                printf "%-30s " "$name"
                printf "Status: $(format_status "$status")  "
                printf "Result: $(format_conclusion "$conclusion")\n"

                if [ "$status" != "completed" ]; then
                    all_completed=false
                fi

                if [ "$conclusion" == "failure" ]; then
                    any_failed=true
                fi
            done

            echo ""
            echo -e "${BLUE}───────────────────────────────────────────────────${NC}"

            # Check if all workflows are complete
            if echo "$response" | grep -q '"status":"completed"'; then
                local completed_count=$(echo "$response" | grep -o '"status":"completed"' | wc -l)
                if [ "$completed_count" -eq "$total_count" ]; then
                    echo ""
                    if echo "$response" | grep -q '"conclusion":"failure"'; then
                        echo -e "${RED}✗ Workflows completed with FAILURES${NC}"
                        echo -e "${BLUE}View details: https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${commit}${NC}"
                        exit 1
                    else
                        echo -e "${GREEN}✓ All workflows completed successfully!${NC}"
                        echo -e "${BLUE}View details: https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${commit}${NC}"
                        exit 0
                    fi
                fi
            fi

            echo -e "${YELLOW}Workflows still running... (${poll_count}/${MAX_POLLS})${NC}"
        fi

        poll_count=$((poll_count + 1))

        if [ $poll_count -lt $MAX_POLLS ]; then
            sleep $POLL_INTERVAL
        fi
    done

    echo ""
    echo -e "${YELLOW}⚠ Timeout: Max polls reached (${MAX_POLLS})${NC}"
    echo -e "${BLUE}View workflow status: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions${NC}"
    exit 2
}

# Run monitoring
monitor_workflows "$COMMIT_SHA"
