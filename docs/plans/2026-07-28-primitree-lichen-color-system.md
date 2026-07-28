# Primitree Lichen Color System Implementation Plan

**Goal:** Replace the former purple brand treatment with the approved Lichen palette across the documentation site and standalone playground.

**Scope:** Update Primitree product chrome, interactive states, the animated tree, static marks, and favicons. Keep example token values and package fixtures unchanged because they belong to the demo data.

**Release boundary:** This work does not publish packages, deploy a production site, or connect domains.

## Approved colors

| Role         | Value                   |
| ------------ | ----------------------- |
| Dark accent  | `#A8C95F`               |
| Light accent | `#5F7F2F`               |
| Soft tint    | `#DDE9B9`               |
| Accent wash  | `rgb(168 201 95 / 10%)` |
| Success      | `#45C98B`               |
| Warning      | `#F2B84B`               |
| Error        | `#F27575`               |

The near-black surfaces and white typography remain the foundation. Primary actions and keyboard focus stay neutral. Lichen appears in supporting states and the animated mark.

## Task 1: Protect the color decisions with failing tests

**Files:**

- Create: `apps/docs/tests/color-system.test.ts`
- Create: `apps/playground/src/color-system.test.ts`

- [ ] Add a documentation-site test that reads the site theme, embedded playground styles, animated mark, static mark, and favicon.
- [ ] Assert that the approved palette variables exist with their exact values.
- [ ] Assert that the former Primitree purple values no longer appear in those brand files.
- [ ] Assert that the playground heading uses a solid accent instead of gradient text.
- [ ] Assert that the animated mark has a white body, Lichen nodes, a faint Lichen halo, and neutral rings.
- [ ] Assert that the static tree stays white and the favicon uses the light-background accent.
- [ ] Run the new documentation-site test and confirm that it fails against the current purple treatment:

```sh
node --test apps/docs/tests/color-system.test.ts
```

- [ ] Add a standalone-playground test for its theme variables, title, primary action, focus treatment, static mark, and favicon.
- [ ] Run the new playground test and confirm that it fails against the current purple treatment:

```sh
pnpm --filter primitree-playground exec vitest run src/color-system.test.ts
```

The checks must target these Primitree UI files:

```text
apps/docs/app/global.css
apps/docs/components/landing/animated-mark.tsx
apps/docs/components/landing/site-chrome.tsx
apps/docs/components/playground/playground.css
apps/docs/public/favicon.svg
apps/docs/public/primitree-icon.svg
apps/playground/src/styles.css
apps/playground/public/favicon.svg
apps/playground/src/assets/primitree-icon.svg
README.md
```

Do not reject purple values across the repository. Files such as `sample-variables.json`, DTCG fixtures, and generated test output contain user-data examples rather than Primitree brand colors.

## Task 2: Apply Lichen to the documentation site

**Files:**

- Modify: `apps/docs/app/global.css`
- Modify: `apps/docs/components/landing/animated-mark.tsx`
- Modify: `apps/docs/components/landing/site-chrome.tsx`
- Modify: `apps/docs/components/playground/playground.css`
- Modify: `apps/docs/public/favicon.svg`
- Modify: `apps/docs/public/primitree-icon.svg`

- [ ] Replace the theme colors in `global.css` with:

```css
--color-primitree-accent: #a8c95f;
--color-primitree-accent-strong: #5f7f2f;
--color-primitree-accent-soft: #dde9b9;
--color-primitree-accent-wash: rgb(168 201 95 / 10%);
--color-primitree-good: #45c98b;
--color-primitree-warn: #f2b84b;
--color-primitree-error: #f27575;
```

- [ ] Use 25% Lichen for text selection and the 10% accent wash for selected playground controls.
- [ ] Map the Fumadocs shell variables to the Primitree surfaces, text, accent, focus, and status colors.
- [ ] Keep keyboard focus white so it remains visible against the dark surfaces.
- [ ] Use the accent wash and Lichen text for active desktop and mobile navigation items.
- [ ] Remove the colored fill gradient from the animated tree.
- [ ] Render the tree body in white, its node dots and pulses in Lichen, and its halo at ten percent Lichen.
- [ ] Render both orbit rings and the tree shadow in neutral white.
- [ ] Replace the embedded playground title gradient with a solid Lichen accent.
- [ ] Keep embedded playground primary actions white with near-black text.
- [ ] Route error and warning states through the approved semantic colors.
- [ ] Set `primitree-icon.svg` to white.
- [ ] Set `favicon.svg` to `#5F7F2F` so it stays visible on light browser chrome.
- [ ] Run the documentation-site color test:

```sh
node --test apps/docs/tests/color-system.test.ts
```

Expected result: all color-system assertions pass.

## Task 3: Apply Lichen to the standalone playground

**Files:**

- Modify: `apps/playground/src/styles.css`
- Modify: `apps/playground/public/favicon.svg`
- Modify: `apps/playground/src/assets/primitree-icon.svg`

- [ ] Add the same approved palette to the playground theme variables.
- [ ] Match the documentation site's background, raised surface, hover surface, and primary text values.
- [ ] Remove the purple page glow.
- [ ] Replace the title gradient with a solid Lichen accent.
- [ ] Use the accent wash for drag, step, chip, and file states.
- [ ] Change the primary button to white with near-black text.
- [ ] Change keyboard focus to white.
- [ ] Route success, warning, and error states through the approved values.
- [ ] Set the in-app tree to white.
- [ ] Set the favicon to `#5F7F2F`.
- [ ] Run the standalone-playground color test:

```sh
pnpm --filter primitree-playground exec vitest run src/color-system.test.ts
```

Expected result: all color-system assertions pass.

## Task 4: Run workspace checks

- [ ] Extend the brand guard so palette-owned files and future UI source files reject the former Primitree colors while sample token values remain unrestricted.
- [ ] Replace the former DTCG badge color in the public README and cover badge URLs in the guard.
- [ ] Add a browser check for the resolved Fumadocs background and active-link color.
- [ ] Update browser focus checks to expect the neutral text color.
- [ ] Add route checks at 390 and 1440 pixels for the empty and sample-loaded views.
- [ ] Run the focused documentation-site suite:

```sh
pnpm --filter primitree-docs test
```

- [ ] Run the focused standalone-playground suite:

```sh
pnpm --filter primitree-playground test
```

- [ ] Run formatting, lint, type, test, build, prose, and package checks from the workspace root using the existing project scripts.
- [ ] Search the scoped UI files for every former Primitree purple value.
- [ ] Search Git-visible text for prohibited attribution and trailers.

## Task 5: Inspect the result in a browser

- [ ] Start the documentation site on a local server.
- [ ] Inspect the homepage and embedded playground at 390, 768, 1024, and 1440 pixels wide.
- [ ] Confirm that the tree body is white, Lichen colors the node accents, rings stay neutral, and no purple glow remains.
- [ ] Confirm that primary actions and focus states are neutral.
- [ ] Start the standalone playground on a local server.
- [ ] Inspect its empty and sample-loaded states at 390 and 1440 pixels wide.
- [ ] Confirm that there is no horizontal overflow, clipped content, weak focus indicator, or low-contrast state text.
- [ ] Record screenshots outside the repository for review.

## Task 6: Review and handoff

- [ ] Review the complete diff for scope, accessibility, and visual consistency.
- [ ] Update the color-system architecture note from `Ready for review` to `Approved`.
- [ ] Run the prose check after the documentation status change.
- [ ] Verify the final commit author and committer are Mark Learst, with no body or trailers.
- [ ] Leave package publishing, production deployment, and domain setup untouched.
