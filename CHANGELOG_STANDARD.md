# Streamio Changelog Formatting Standard

Every release body on GitHub must be grouped into these sections, in this order. Omit a section
entirely if it has no entries that release — don't leave empty headers.

## ➕ Added
Brand new systems, features, menus, UI, backend services, APIs, integrations, settings, tools —
anything that didn't exist before. A ground-up rewrite of an existing system also belongs here
(call it out as a rebuild), not under Updated.

## ✅ Updated
Improvements, refinements, optimizations, or behavior changes to something that already existed.

## ❓ Preview / Experimental
Anything shipped for testing that isn't considered final — may be buggy, incomplete, or removed
entirely later.

## ➖ Removed
Anything taken out: features, menus, deprecated endpoints, dead code, fixed bugs that used to be
present, temporary/experimental systems being retired.

## Rules
- One change per bullet. Never combine ("Added playlists, favorites, and history" -> split into
  three bullets).
- Start every bullet with an action verb (Added / Updated / Improved / Optimized / Fixed / Refined
  / Redesigned / Introduced / Integrated / Removed / Deprecated / Reverted / Replaced).
- Keep each bullet to one concise sentence, description only — no implementation narrative ("spent
  hours rewriting X" doesn't belong in a changelog).
- Group strictly by category; don't interleave.

## Template

```
## ➕ Added
- Added X.
- Added Y.

## ✅ Updated
- Improved X.
- Updated Y.

## ❓ Preview
- Experimental X.

## ➖ Removed
- Removed X.
```
