# Design principles

Rules for how plainpanel UIs are built: which control to reach for, how
controls are grouped, and what the page must still say with CSS turned off.
They apply to the demo and to anything built with the panel builder.

## Controls

1. **One button, one action.** A button does exactly one thing, every time
   it is clicked. Its label names that action and never changes. No
   `data-text` on a button.

2. **State lives in state controls, not in buttons.** Clicking the same
   button to flip something back and forth hides the current state inside a
   label. Use the control whose native job is holding state, and pick it by
   how the states are named:
   - **"Is X on?"** One statement that is true or false; off is just "not
     X". Use a **checkbox** with a fixed label naming X (`🧊 3D`,
     `⚡ armed`, `🕸 wireframe`). When it takes effect immediately, like a
     flick switch, add the `switch` attribute: browsers that support it
     draw a switch, the rest a plain checkbox.
   - **"Which X?"** Each state has its own name and neither is "off"
     (theme: `☾ dark` / `☀ light`, and a third mode could join later). Use a
     **radio group**.
   - **Something that happens once** (`▶ start run`, `⏹ stop`). That's a
     button: rules 1 and 3.

3. **Opposing actions are separate buttons, gated by state.** When an action
   has a counterpart (arm / disarm, start / stop), give each its own button
   with a fixed label. Bind `data-disabled` to the store so only the action
   that is valid right now is enabled. The enabled set *is* the state
   readout: you can see what the system is doing by what you can click.

4. **Native elements only.** Use the HTML element built for the job:
   `output` for live values, `meter` / `progress` for gauges, `details` for
   collapsible groups, `dialog` for confirmation, `datalist` for
   suggestions. No div-built widgets, no custom elements.

5. **Prefer native behaviour to JS.** If the platform already does it, the
   app does not reimplement it: the exclusive accordion is `<details name>`,
   the modal is `commandfor` / `command`, the popover is `popovertarget`.

## Grouping

6. **Every control sits in a `fieldset`.** The fieldset is the unit of
   grouping, and its `legend` names the group. Exception: the top bar, which
   is a single status-and-commands strip.

7. **Collapsible groups go inside the fieldset.** `fieldset > details`, not
   the other way round. Related `details` (one accordion) share one
   fieldset.

## Legibility

8. **Meaning is HTML content, not CSS.** The page must read correctly as
   plain text, to a screen reader, an LLM, or anyone with styles off.
   Labels, glyphs and affordance hints (the `⋮` / `⋯` resize grips) are real
   characters in the markup. CSS may hide or reveal them; it never creates
   them (no `content:` strings).

9. **Give choices and actions a glyph.** Label each option in a selection
   and each button with an emoji or symbol next to its word (`☾ dark`,
   `☀ light`, `▶ start run`, `⏹ stop`). People recognise a
   small picture faster than they read a word, and a glyph still says
   something to someone who doesn't read the UI's language. The glyph goes
   alongside the word, never instead of it: the word is what screen readers,
   search and LLMs rely on (rule 8).

10. **CSS is structure, not appearance.** Stylesheets lay out the panels
    (grid, scrolling, resize handles). Controls keep their browser-default
    look.

11. **Everything works with no CSS.** With every author stylesheet off, the
    page must stay fully legible and fully functional: every label, value
    and control is present, readable and usable. Only layout may be lost;
    never information, a control, or state. CSS therefore never carries
    meaning or state: no CSS-only tabs or `:checked` tricks, no hiding
    content with `display`. Showing and hiding is the native `hidden`
    attribute, set from the store. The demo's "🚫 no CSS" toggle is the
    test.
