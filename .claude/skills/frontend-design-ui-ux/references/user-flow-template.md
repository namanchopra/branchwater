# User Flow Template

Use this template when documenting user journeys and interaction flows.

---

## Flow: [Flow Name]

### Overview

**Goal:** [What the user is trying to accomplish in one sentence]

**User Story:** As a [role], I want to [action] so that [benefit].

**Trigger:** [What initiates this flow - user action, system event, navigation]

### Entry Points

Users can enter this flow from:
- [ ] [Entry point 1] - [context/state when entering]
- [ ] [Entry point 2] - [context/state when entering]
- [ ] [Direct URL] - [URL pattern, e.g., /dashboard/settings]

### Prerequisites

Before starting this flow, user must:
- [ ] [Prerequisite 1, e.g., Be authenticated]
- [ ] [Prerequisite 2, e.g., Have required permissions]
- [ ] [Prerequisite 3, e.g., Have completed onboarding]

### Flow Diagram

```
[Start]
    │
    ▼
┌─────────────┐
│   Step 1    │
└─────────────┘
    │
    ▼
◇ Decision Point?
    │
    ├── Yes ──▶ [Path A]
    │
    └── No ───▶ [Path B]
    │
    ▼
┌─────────────┐
│   Step N    │
└─────────────┘
    │
    ▼
[End: Success/Exit]
```

### Steps

#### Step 1: [Step Name]

**Screen/Component:** [Component or page name]

**User Action:**
- [Primary action user takes]
- [Secondary actions available]

**System Response:**
- [What the system does]
- [Visual feedback provided]

**Data:**
- Input: [data user provides]
- Output: [data system returns/displays]

**Transitions:**
- Success → Step 2
- Error → Error State A
- Cancel → [Previous step or exit]

---

#### Step 2: [Step Name]

**Screen/Component:** [Component or page name]

**User Action:**
- [Actions]

**System Response:**
- [Responses]

**Validation:**
```typescript
// Validation rules for this step
interface Step2Validation {
  field1: { required: true, minLength: 3 };
  field2: { required: false, pattern: /regex/ };
}
```

**Transitions:**
- Success → Step 3
- Validation Error → Show inline errors, stay on step
- Network Error → Error State B

---

### Decision Points

#### Decision: [Decision Name]

**Condition:** [What determines the branch]

**Branch A: [Condition True]**
- Goes to: [Step/Screen]
- User sees: [What changes]

**Branch B: [Condition False]**
- Goes to: [Step/Screen]
- User sees: [What changes]

### Exit Points

#### Success Exit
- **Condition:** [What constitutes success]
- **Destination:** [Where user goes next]
- **Feedback:** [Success message, toast, redirect]
- **Side effects:** [Data saved, email sent, etc.]

#### Cancel/Abandon Exit
- **Condition:** [User cancels, closes, navigates away]
- **Confirmation:** [Required? What message?]
- **Data handling:** [Draft saved? Lost? Auto-saved?]
- **Destination:** [Where user returns to]

#### Error Exit
- **Condition:** [Unrecoverable error]
- **Feedback:** [Error page, message]
- **Recovery:** [Retry option, support contact]

### Error Handling

| Error Type | Trigger | User Message | Recovery Action |
|------------|---------|--------------|-----------------|
| Validation | Invalid input | Inline field error | Fix and retry |
| Network | Request failed | Toast + retry button | Auto-retry or manual |
| Permission | 403 response | Access denied page | Request access link |
| Not Found | 404 response | Not found page | Back to safe page |
| Server | 500 response | Error page | Retry later |
| Timeout | Request timeout | Timeout message | Retry button |

### Edge Cases

| Scenario | Handling |
|----------|----------|
| User refreshes mid-flow | [Restore state from URL/storage or restart] |
| Session expires | [Redirect to login, preserve return URL] |
| Concurrent edit | [Lock, merge, or last-write-wins] |
| Back button pressed | [Previous step or confirmation] |
| Browser closed | [Draft auto-saved or lost] |
| Slow connection | [Show loading states, timeout gracefully] |
| Offline | [Queue actions or show offline message] |

### State Requirements

**URL State:**
```typescript
// URL parameters for deep linking
interface FlowURLParams {
  step?: '1' | '2' | '3';
  id?: string;
  returnTo?: string;
}
```

**Local State:**
```typescript
// Component/page state
interface FlowState {
  currentStep: number;
  formData: Partial<FormData>;
  errors: Record<string, string>;
  isSubmitting: boolean;
}
```

**Persisted State:**
```typescript
// Data saved across sessions
interface PersistedState {
  draft?: Partial<FormData>;
  lastStep?: number;
}
```

### Analytics Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `flow_started` | Flow entry | `{ source, userId }` |
| `step_completed` | Step success | `{ step, duration }` |
| `flow_completed` | Success exit | `{ totalDuration }` |
| `flow_abandoned` | Cancel/close | `{ lastStep, reason }` |
| `error_occurred` | Error state | `{ type, step, message }` |

### Accessibility Considerations

- **Focus management:** [Where focus goes on step change]
- **Announcements:** [Screen reader announcements for state changes]
- **Progress indication:** [How progress is communicated]
- **Error announcement:** [How errors are announced]

### Implementation Target

- **Agent:** `[nextjs-senior-engineer | react-vite-tailwind-engineer]`
- **Components needed:** [List of components this flow requires]
- **API endpoints:** [Backend requirements]

### Acceptance Criteria

- [ ] All happy path steps work as documented
- [ ] All error states display appropriate feedback
- [ ] All edge cases handled gracefully
- [ ] URL state enables deep linking and refresh
- [ ] Back/forward navigation works correctly
- [ ] Analytics events fire at correct points
- [ ] Accessibility requirements met
- [ ] Mobile flow works (if applicable)
