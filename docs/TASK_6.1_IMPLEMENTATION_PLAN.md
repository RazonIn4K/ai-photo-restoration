# Task 6.1 Implementation Plan: Intent Classification Worker

**Status**: Planning
**Created**: 2025-11-07
**Dependencies**: Task 5 (BullMQ) ✅

---

## Executive Summary

The Intent Classification Worker analyzes user restoration requests to:
1. **Extract intent** from natural language text
2. **Assess image complexity** and damage level
3. **Assign confidence scores** to classifications
4. **Route jobs** to appropriate AI pipeline (local vs cloud)
5. **Flag low-confidence cases** for human triage

## Architecture Decisions

### Decision 1: Classification Approach

**Options Evaluated**:
- A) **Rule-based keyword matching** (simple, deterministic, limited)
- B) **ML-based NLP model** (accurate, requires training data, heavy)
- C) **Hybrid: Keywords + heuristics + LLM API** (balanced, flexible, pragmatic)

**Selected**: **Option C - Hybrid Approach**

**Rationale**:
- No training data exists yet → ML model not viable initially
- Pure keywords miss nuance → need semantic understanding
- Gemini/OpenAI APIs provide good intent extraction at low cost
- Can evolve to custom model as data accumulates

### Decision 2: Library Selection

**Text Analysis**:
- **natural** (Node.js NLP library) - tokenization, sentiment analysis
- **compromise** - lightweight NLP with part-of-speech tagging
- **Gemini API** - semantic intent extraction for ambiguous cases

**Image Analysis**:
- **sharp** (already integrated) - quick damage assessment via metadata
- **@tensorflow/tfjs-node** - future: damage severity classification
- **sharp-phash** (already integrated) - detect heavily corrupted images

**Confidence Scoring**:
- **Custom heuristic** - weighted scoring based on:
  - Keyword match confidence (0-1)
  - Text length and clarity (0-1)
  - Image quality indicators (0-1)
  - Combined weighted score

## Classification Logic

### Intent Categories

```typescript
enum RestorationIntent {
  /** Basic color correction, minor touch-ups */
  SIMPLE_ENHANCEMENT = 'simple_enhancement',

  /** Moderate damage, scratches, fading */
  MODERATE_RESTORATION = 'moderate_restoration',

  /** Severe damage, missing sections, heavy degradation */
  COMPLEX_RESTORATION = 'complex_restoration',

  /** Colorization of black & white photos */
  COLORIZATION = 'colorization',

  /** Face restoration focus */
  FACE_RESTORATION = 'face_restoration',

  /** Unclear or ambiguous request */
  UNCLEAR = 'unclear'
}
```

### Routing Rules

```typescript
interface RoutingDecision {
  pipeline: 'local' | 'cloud';
  intent: RestorationIntent;
  confidence: number; // 0-1
  requiresHumanReview: boolean;
  reasoning: string; // Explanation for audit trail
}
```

**Routing Logic**:
- `SIMPLE_ENHANCEMENT` → **Local** (fast, cheap)
- `MODERATE_RESTORATION` → **Local** if confidence >0.7, else **Cloud**
- `COMPLEX_RESTORATION` → **Cloud** (Gemini better at severe damage)
- `COLORIZATION` → **Cloud** (Gemini excels at colorization)
- `FACE_RESTORATION` → **Local** (CodeFormer/GFPGAN specialized)
- `UNCLEAR` → **Human Triage** (confidence <0.5)

### Confidence Scoring Algorithm

```typescript
interface ConfidenceFactors {
  keywordMatch: number;      // 0-1, weight: 0.3
  textClarity: number;        // 0-1, weight: 0.2
  textLength: number;         // 0-1, weight: 0.1
  imageQuality: number;       // 0-1, weight: 0.2
  semanticMatch: number;      // 0-1, weight: 0.2 (from LLM if used)
}

function calculateConfidence(factors: ConfidenceFactors): number {
  return (
    factors.keywordMatch * 0.3 +
    factors.textClarity * 0.2 +
    factors.textLength * 0.1 +
    factors.imageQuality * 0.2 +
    factors.semanticMatch * 0.2
  );
}
```

**Thresholds**:
- **High confidence**: >0.7 → Auto-route
- **Medium confidence**: 0.5-0.7 → Route with warning flag
- **Low confidence**: <0.5 → Human triage required

## Implementation Steps

### Phase 1: Core Classification Engine (2-3 hours)

**Files to Create**:
```
src/workers/
  └── classification/
      ├── index.ts               # Worker entry point
      ├── intent-classifier.ts   # Main classification logic
      ├── keyword-matcher.ts     # Keyword-based matching
      ├── confidence-scorer.ts   # Confidence calculation
      ├── routing-decision.ts    # Pipeline routing logic
      └── types.ts              # Classification types
```

**Implementation**:
1. Create keyword dictionaries for each intent category
2. Implement keyword matching with fuzzy logic
3. Build confidence scoring system
4. Implement routing decision logic
5. Add comprehensive logging for audit trail

### Phase 2: Queue Integration (1 hour)

**Files to Modify**:
```
src/queues/
  ├── manager.ts              # Add classification job handler
  └── index.ts               # Export classification worker
```

**Implementation**:
1. Create classification job processor
2. Connect to classification queue
3. Emit restoration job after classification
4. Update RequestRecord with classification results
5. Handle failures with retry logic

### Phase 3: Image Analysis (1-2 hours)

**Files to Create**:
```
src/workers/classification/
  └── image-analyzer.ts      # Image quality/damage assessment
```

**Implementation**:
1. Extract image metadata (dimensions, format, quality)
2. Compute basic damage indicators:
   - Contrast/brightness ranges
   - Color saturation levels
   - Noise levels (via histogram analysis)
3. Detect heavily corrupted images (via phash variance)
4. Generate image quality score (0-1)

### Phase 4: Advanced Semantic Analysis (Optional, 1-2 hours)

**Files to Create**:
```
src/workers/classification/
  └── semantic-analyzer.ts   # LLM-based intent extraction
```

**Implementation**:
1. Create Gemini API client for intent extraction
2. Build prompt template for intent classification
3. Parse LLM response into structured intent
4. Implement caching to reduce API calls
5. Fallback to keyword matching if API unavailable

### Phase 5: Testing (2-3 hours)

**Files to Create**:
```
tests/workers/
  └── classification/
      ├── intent-classifier.test.ts
      ├── keyword-matcher.test.ts
      ├── confidence-scorer.test.ts
      ├── routing-decision.test.ts
      └── image-analyzer.test.ts
```

**Test Scenarios**:
1. **Keyword Matching**:
   - "Please restore this old photo" → MODERATE_RESTORATION
   - "Fix the scratches" → SIMPLE_ENHANCEMENT
   - "Colorize this black and white picture" → COLORIZATION
   - "My grandma's face is damaged" → FACE_RESTORATION

2. **Confidence Scoring**:
   - Clear request → high confidence
   - Vague request → low confidence
   - Ambiguous language → medium confidence

3. **Routing Decisions**:
   - Simple + high confidence → Local
   - Complex + any confidence → Cloud
   - Unclear → Human triage

4. **Image Analysis**:
   - High quality image → simple enhancement
   - Low quality/damaged → complex restoration
   - Black & white → colorization candidate

## Data Structures

### Classification Input

```typescript
interface ClassificationInput {
  requestId: string;
  userRequest: string;         // User's text description
  imageBuffer: Buffer;         // Original image data
  imageMetadata: {
    width: number;
    height: number;
    format: string;
    quality?: number;
  };
}
```

### Classification Output

```typescript
interface ClassificationResult {
  requestId: string;
  intent: RestorationIntent;
  confidence: number;
  pipeline: 'local' | 'cloud';
  requiresHumanReview: boolean;
  reasoning: string;
  metadata: {
    keywordMatches: string[];
    imageQualityScore: number;
    processingTimeMs: number;
    classifierVersion: string;
  };
}
```

## Dependencies to Add

```bash
# NLP libraries
npm install natural compromise

# Optional: Gemini API for semantic analysis
npm install @google/generative-ai

# Already have: sharp, sharp-phash, @tensorflow/tfjs-node (optional)
```

## Success Criteria

- [ ] Classification worker processes jobs from queue
- [ ] Accurate intent detection (>80% accuracy on test cases)
- [ ] Confidence scores correlate with classification accuracy
- [ ] Routing decisions follow business logic
- [ ] Low-confidence cases flagged for human review
- [ ] Processing time <2 seconds per request
- [ ] Comprehensive test coverage (>90%)
- [ ] Audit trail logged for every classification
- [ ] Integration with existing queue system
- [ ] Database updates reflect classification results

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Keyword matching too simplistic | Medium | Add semantic analysis via LLM API |
| Low confidence on many requests | High | Tune thresholds, improve keyword dictionary |
| Image analysis too slow | Medium | Use lightweight heuristics, cache results |
| LLM API costs too high | Low | Implement aggressive caching, fallback to keywords |
| Classification accuracy poor | High | Collect real data, iterate on algorithm |

## Future Enhancements

1. **ML Model Training**:
   - Collect classification decisions + human corrections
   - Train custom intent classification model
   - Replace keyword matching with ML inference

2. **Advanced Image Analysis**:
   - Deep learning damage assessment
   - Face detection and quality scoring
   - Automatic complexity estimation

3. **Feedback Loop**:
   - Track classification accuracy vs human corrections
   - Automatically adjust confidence thresholds
   - Continuous improvement pipeline

4. **Multi-language Support**:
   - Detect language of user request
   - Translate to English for classification
   - Support international users

## Timeline Estimate

- **Phase 1** (Core Engine): 2-3 hours
- **Phase 2** (Queue Integration): 1 hour
- **Phase 3** (Image Analysis): 1-2 hours
- **Phase 4** (Semantic Analysis): 1-2 hours (optional)
- **Phase 5** (Testing): 2-3 hours

**Total**: 7-11 hours for complete implementation

**Recommended Approach**: Implement Phases 1-3 first (4-6 hours), test thoroughly, then add Phase 4 if needed based on real-world performance.

---

## Next Steps

1. **Review and approve this plan**
2. **Install dependencies** (`natural`, `compromise`)
3. **Implement Phase 1** (core classification engine)
4. **Write tests** for keyword matching and confidence scoring
5. **Integrate with queue system** (Phase 2)
6. **Test end-to-end** with sample requests
7. **Iterate** based on results

---

**Questions for Review**:
1. Should we implement semantic analysis (Phase 4) in the first iteration?
2. What confidence threshold should trigger human triage? (Currently: <0.5)
3. Should we track classification decisions for future ML training?
4. Do we need real-time metrics for classification performance?
