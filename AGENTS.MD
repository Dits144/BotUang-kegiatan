# BotUang UI Engineering Rules

## Product Direction

BotUang is a mobile-first WhatsApp group financial management product.

It should feel like:
- modern mobile banking
- expense tracker
- group treasury application
- professional FinTech software

It must NOT look like:
- generic AI-generated SaaS
- admin template
- crypto dashboard
- cyberpunk dashboard
- Dribbble concept that is difficult to use

## UI Foundation

Use:
- shadcn/ui as the primary component foundation
- Tailwind CSS for styling
- Lucide for interface icons
- Motion for purposeful micro-interactions
- Recharts for financial charts
- Sonner for toast feedback

Magic UI may only be used selectively.

DO NOT introduce another UI framework without a strong reason.

## Anti AI-Slop Rules

Never automatically use:
- huge gradient text
- glowing borders everywhere
- excessive glassmorphism
- gradient blobs
- excessive pills
- rounded-3xl on every element
- giant hero sections inside the dashboard
- excessive shadows
- random badges
- unnecessary icons
- excessive animations
- fake metrics
- fake charts
- decorative widgets without product value

Not every section needs a Card component.

Prefer:
- typography
- spacing
- hierarchy
- alignment
- borders
- subtle surface elevation

over decoration.

## Mobile First

Design at 390px FIRST.

Then verify:
360px
390px
768px
1024px
1366px
1440px

Never create desktop UI first and simply stack it vertically.

Mobile must have intentional layouts.

Desktop:
sidebar navigation

Mobile:
bottom navigation + sheets/drawers

## Finance UX

Financial information gets the strongest visual hierarchy.

Priority:

1. Current Balance
2. Income / Expense
3. Quick Transaction
4. Cash Flow
5. Recent Transactions
6. Member Contributions
7. Activities

Currency:

Rp 1.250.000

Use:
font-variant-numeric: tabular-nums;

Positive:
emerald

Expense:
coral/red

Neutral financial information:
foreground/white

Do not make the entire application green.

## Components

Before creating a new component:

1. Check existing local components.
2. Check shadcn/ui.
3. Reuse existing design patterns.
4. Only then create a new component.

Avoid duplicate components.

Bad:

Button.tsx
PrimaryButton.tsx
GreenButton.tsx
SubmitButton.tsx

Good:

Button.tsx
with appropriate variants.

## Radius

Buttons: 10-12px
Inputs: 10-12px
Cards: 14-16px
Sheets: 20-24px top corners

Do not use rounded-3xl everywhere.

## Interaction

Every interactive element must have:
- hover state where applicable
- active state
- focus-visible state
- disabled state
- loading state when asynchronous

Touch targets should be approximately >=44px.

Never rely on hover for mobile functionality.

## Animation

Animation must explain interaction.

Good:
- drawer opening
- transaction inserted
- checkbox completion
- balance update
- tab indicator
- subtle page transition

Bad:
- cards floating continuously
- glowing text
- everything fading from below
- excessive stagger animation

Prefer 150-300ms.

Respect prefers-reduced-motion.

## Mobile Transactions

NEVER compress desktop financial tables into mobile screens.

Desktop:
table

Mobile:
transaction list

Example:

↓ Iuran Bulanan
  Hari ini · Raditya            +Rp150.000

↑ Konsumsi
  Kemarin · Fadlan              -Rp85.000

Tapping a row opens transaction details.

## Forms

Mobile forms should use bottom sheets when appropriate.

Transaction entry:

Catat Transaksi

[Pemasukan] [Pengeluaran]

Nominal
Rp ____________

Catatan
______________

Tanggal
Hari ini

[Simpan Transaksi]

Use appropriate mobile keyboard input modes.

## Loading

Prefer skeletons matching the actual component.

Do not replace an entire page with a centered spinner.

## Empty States

Every data-driven section must have:
loading
success
empty
error

states.

Never insert fake financial records simply to make UI look populated.

## Accessibility

Maintain:
- readable contrast
- keyboard navigation
- visible focus
- semantic HTML
- labels for inputs
- accessible dialogs
- accessible sheets
- aria labels for icon-only actions

## Final UI Review

Before completing a UI task ask:

1. Does this look like a generic AI dashboard?
2. Are there too many cards?
3. Are there too many rounded containers?
4. Is hierarchy obvious?
5. Can someone operate this one-handed on mobile?
6. Is financial information immediately understandable?
7. Is every visual element useful?
8. Does dark AND light mode work?
9. Does 360px work without horizontal overflow?
10. Could anything decorative be removed?

If removing an element improves clarity, remove it.