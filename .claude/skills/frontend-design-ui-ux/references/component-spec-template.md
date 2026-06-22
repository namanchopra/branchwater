# Component Specification Template

Use this template when specifying individual components for engineering handoff.

---

## Component: [ComponentName]

### Purpose
[One sentence describing what this component does and when to use it]

### Variants
- `default`: [description of default appearance/behavior]
- `[variant-name]`: [description]
- `[variant-name]`: [description]

### Props

```typescript
interface [ComponentName]Props {
  /** Required: [description] */
  requiredProp: string;

  /** Optional: [description]. Default: [default value] */
  optionalProp?: boolean;

  /** Variant selection */
  variant?: 'default' | 'secondary' | 'destructive';

  /** Size variant */
  size?: 'sm' | 'md' | 'lg';

  /** Disabled state */
  disabled?: boolean;

  /** Loading state */
  loading?: boolean;

  /** Click handler */
  onClick?: () => void;

  /** Children content */
  children?: React.ReactNode;

  /** Additional class names */
  className?: string;
}
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default | [description] | [description] |
| Hover | [description] | [description] |
| Focus | [description] | [description] |
| Active | [description] | [description] |
| Disabled | [description] | [description] |
| Loading | [description] | [description] |
| Error | [description] | [description] |

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile (<640px) | [specific changes: full width, stacked, hidden, etc.] |
| Tablet (640-1024px) | [specific changes] |
| Desktop (>1024px) | [default behavior] |

### Accessibility

**ARIA:**
- Role: `[role]` (e.g., button, dialog, listbox)
- aria-label: [when to use, what value]
- aria-describedby: [reference to description element]
- aria-expanded: [for expandable elements]
- aria-disabled: [when disabled]

**Keyboard Navigation:**
| Key | Action |
|-----|--------|
| Tab | [focus behavior] |
| Enter | [activation] |
| Space | [activation] |
| Escape | [dismissal/cancel] |
| Arrow keys | [navigation within] |

**Screen Reader:**
- Announces: [what is announced on focus]
- State changes: [what is announced on state change]
- Live regions: [if applicable, aria-live settings]

### Animations

| Trigger | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Enter | [description] | 300ms | ease-out |
| Exit | [description] | 200ms | ease-in |
| State change | [description] | 150ms | ease-in-out |

### Composition

**Slots/Children:**
- `children`: [what can be passed as children]
- `icon`: [icon slot, if applicable]
- `prefix`: [prefix content]
- `suffix`: [suffix content]

**Compound Components (if applicable):**
```tsx
<ComponentName>
  <ComponentName.Header />
  <ComponentName.Body />
  <ComponentName.Footer />
</ComponentName>
```

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty content | [behavior] |
| Overflow text | [truncate, wrap, scroll] |
| Missing required data | [error state, fallback] |
| Network error | [retry, error message] |
| Concurrent actions | [disable, queue, replace] |

### Dependencies

- **Required libraries:** [e.g., @radix-ui/react-dialog, framer-motion]
- **Peer components:** [e.g., uses Button, Icon internally]
- **Context requirements:** [e.g., must be within ThemeProvider]

### Implementation Notes

**Performance:**
- [memo requirements]
- [lazy loading considerations]
- [virtualization if list-based]

**Testing:**
- [key test scenarios]
- [accessibility tests]
- [interaction tests]

### Implementation Target

- **Agent:** `[nextjs-senior-engineer | react-vite-tailwind-engineer]`
- **Framework notes:** [any framework-specific guidance, e.g., "use 'use client' directive"]
- **File location:** `[suggested path, e.g., src/components/ui/ComponentName.tsx]`

### Acceptance Criteria

- [ ] Renders all variants correctly
- [ ] All states visually distinct and functional
- [ ] Keyboard navigation works as specified
- [ ] Screen reader announces appropriately
- [ ] Responsive at all breakpoints
- [ ] Animations smooth at 60fps
- [ ] Props validated with TypeScript
- [ ] Unit tests cover main scenarios
