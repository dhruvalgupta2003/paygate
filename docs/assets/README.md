# Brand assets

Everything needed to embed Limen in docs, dashboards, and blog posts.

| File | Use | Size |
|------|-----|------|
| [`logo.svg`](./logo.svg) | Primary full-colour mark. Preferred default. | 512×512 |
| [`logo-mono.svg`](./logo-mono.svg) | Monochrome mark; inherits `currentColor`. Use inside buttons/nav. | 512×512 |
| [`logo-inverted.svg`](./logo-inverted.svg) | For very dark surfaces — ink-blue body, white posts, mint flow. | 512×512 |
| [`wordmark.svg`](./wordmark.svg) | Horizontal lockup (mark + "limen") for headers. | 900×220 |
| [`favicon.svg`](./favicon.svg) | Simplified favicon; no text, no gradients. | 32×32 |
| [`social-card.svg`](./social-card.svg) | 1200×630 OpenGraph / Twitter card. | 1200×630 |

## Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `limen-indigo` | `#4F46E5` | primary brand |
| `limen-violet` | `#6D28D9` | gradient stop |
| `limen-ink` | `#0B0A1A` | dark surface |
| `limen-cloud` | `#F8FAFC` | light surface, gate posts |
| `limen-cyan` | `#22D3EE` | flow gradient start |
| `limen-mint` | `#10B981` | flow gradient end, success |
| `limen-violet-900` | `#312E81` | body gradient |

## Typography

- **Display / headings**: Inter (or system-ui fallback)
- **Body**: Inter
- **Monospace / code**: `ui-monospace, SFMono-Regular, Menlo, monospace`

## Concept

- Two vertical **gate posts** frame a central **settlement coin**.
- A **chevron of cyan → mint** flows through the middle — the agent's paid request passing the gate.
- The muted `402` microtext is visible only at display size; it anchors the identity to HTTP 402 without forcing the reference.
- Geometry is snapped to a 32-unit grid so the mark renders crisply at 16px.
