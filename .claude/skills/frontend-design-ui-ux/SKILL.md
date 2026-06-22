---
name: frontend-design-ui-ux
description: Design user interfaces with comprehensive UX methodology. Produces implementation-ready specifications, component briefs, and design tokens for handoff to Next.js and React engineering agents. Use when designing new features, creating design systems, planning user flows, or specifying component behavior.
---

# Frontend Design UI/UX Skill

## Purpose

This is a **design skill**, not an implementation skill. It produces:
- Design artifacts and specifications
- Component briefs with TypeScript interfaces
- User flow documentation
- Design tokens and system definitions
- Clear handoff instructions for implementation

**Target Agents:**
- `nextjs-senior-engineer` - For SSR, SEO-critical, App Router projects
- `react-vite-tailwind-engineer` - For SPAs, CLI web UIs, Electron apps

## Design Methodology

### Phase 1: Discovery

Before designing, gather context:

**User Research Questions:**
- Who are the primary users? (roles, technical level, accessibility needs)
- What problem are they solving?
- Where will they use this? (device, context, environment)
- When do they need it? (frequency, urgency, duration)
- Why this feature now? (business goal, user pain point)

**Context Analysis:**
- Existing patterns in the codebase
- Design system constraints
- Tech stack limitations
- Performance requirements
- Accessibility requirements (WCAG 2.1 AA minimum)

### Phase 2: Information Architecture

**Content Inventory:**
- List all data/content to display
- Identify required vs optional fields
- Define content hierarchy

**User Flow Mapping:**
- Entry points (how users arrive)
- Decision points (branching logic)
- Exit points (success, error, abandon)
- Edge cases and error states

**State Mapping:**
Document every state the UI can be in:
- Loading (initial, refresh, pagination)
- Empty (first use, no results, filtered empty)
- Partial (incomplete data, degraded)
- Success (complete, confirmed)
- Error (validation, network, permission, timeout)

### Phase 3: Component Design

**Atomic Design Hierarchy:**
1. **Atoms** - Basic elements (Button, Input, Icon, Text)
2. **Molecules** - Simple combinations (SearchInput, FormField, Card)
3. **Organisms** - Complex sections (Header, ProductList, CommentThread)
4. **Templates** - Page layouts (DashboardLayout, AuthLayout)
5. **Pages** - Specific instances (UserDashboard, LoginPage)

**For Each Component, Define:**
- Purpose (one sentence)
- Variants (visual/behavioral variations)
- Props with TypeScript types
- All possible states
- Responsive behavior at breakpoints
- Accessibility requirements

### Phase 4: Interaction Design

**User Interactions:**
| Interaction | Trigger | Feedback | Duration |
|-------------|---------|----------|----------|
| Click/Tap | Mouse/Touch | Visual + State change | Instant |
| Hover | Mouse enter | Visual highlight | - |
| Focus | Tab/Click | Focus ring | - |
| Drag | Mouse down + move | Ghost + Drop zones | Continuous |
| Swipe | Touch move | Momentum scroll | Gesture-based |

**Feedback Patterns:**
- Loading: Skeleton, spinner, progress bar
- Success: Toast, inline confirmation, redirect
- Error: Inline message, toast, modal (severity-based)
- Progress: Step indicator, progress bar, percentage

**Animation Specifications:**
```typescript
const animations = {
  duration: {
    instant: '0ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
}
```

### Phase 5: Design Tokens

Define tokens for consistency across implementations:

**Colors:**
- Semantic naming (primary, secondary, destructive)
- Full scale for each (50-900)
- Light/dark mode variants

**Typography:**
- Font families (sans, mono, serif if needed)
- Size scale (xs through 4xl)
- Weight scale (normal, medium, semibold, bold)
- Line heights (tight, normal, relaxed)

**Spacing:**
- Base unit: 0.25rem (4px)
- Scale: 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64

**Other Tokens:**
- Border radius (none, sm, md, lg, full)
- Shadows (sm, md, lg, xl)
- Z-index layers (base, dropdown, sticky, modal, toast)
- Breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)

### Phase 6: Engineer Handoff

**Agent Selection Logic:**

| Criteria | Agent |
|----------|-------|
| Server-side rendering needed | `nextjs-senior-engineer` |
| SEO critical | `nextjs-senior-engineer` |
| App Router / Server Components | `nextjs-senior-engineer` |
| API routes / Server Actions | `nextjs-senior-engineer` |
| Pure SPA / client-only | `react-vite-tailwind-engineer` |
| CLI with web UI | `react-vite-tailwind-engineer` |
| Electron/Tauri app | `react-vite-tailwind-engineer` |
| Static site with no SSR | Either (ask user) |
| Unclear | Ask user |

## Output Templates

Use these templates in `references/` directory:
- `component-spec-template.md` - Full component specifications
- `user-flow-template.md` - User journey documentation
- `design-tokens-template.md` - Token system definition

## Quality Checklist

Before handoff to engineering agent, verify:

- [ ] **States**: All states documented (loading, error, empty, success, partial)
- [ ] **Responsive**: Breakpoints defined with specific behavior changes
- [ ] **Accessibility**: ARIA roles, keyboard nav, screen reader announcements
- [ ] **Interactions**: All user interactions mapped with feedback
- [ ] **Animations**: Specifications included (or explicitly marked as none)
- [ ] **Types**: Props typed with TypeScript interfaces
- [ ] **Edge Cases**: Identified and handling specified
- [ ] **Target Agent**: Specified with selection reasoning
- [ ] **Acceptance Criteria**: Clear, testable requirements

## Session Management

**Scope Control:**
- Confirm scope before expanding beyond initial request
- Ask before adding "nice to have" features
- Keep specifications focused on requested functionality

**Checkpoints:**
- After discovery: Confirm understanding
- After IA: Validate user flows
- After component design: Review specs
- Before handoff: Final quality check

**Handoff Signals:**
When specifications are complete, clearly indicate:
```
## Ready for Implementation

Target Agent: [nextjs-senior-engineer | react-vite-tailwind-engineer]

The following specifications are ready for implementation:
1. [Component/Flow name] - [brief description]
2. ...

Invoke the target agent with these specifications to begin implementation.
```

## Integration with Other Skills

This skill produces specifications that are consumed by:
- `nextjs-senior-engineer` - Implements Next.js components
- `react-vite-tailwind-engineer` - Implements React/Vite components

Do NOT implement code directly. Always hand off to the appropriate engineering agent.
