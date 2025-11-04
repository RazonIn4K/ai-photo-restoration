#!/bin/sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    [ "$HUSKY_DEBUG" = "1" ] && printf "%s\n" "$1"
  }

  readonly hook_name="$(basename "$0")"
  debug "husky:debug hook_name: $hook_name"

  if [ "$HUSKY" = "0" ]; then
    debug "husky:debug HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "husky:debug ~/.huskyrc found, sourcing"
    . ~/.huskyrc
  fi
fi

export readonly husky_skip_init=1
[ -f "$0".local ] && . "$0".local

command_exists () {
  command -v "$1" >/dev/null 2>&1
}

if command_exists node; then
  :
else
  echo "husky > can't find node in PATH" >&2
  exit 127
fi
