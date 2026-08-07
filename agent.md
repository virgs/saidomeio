# Agent Notes

Project-specific instructions and decisions from the user.

## Product Direction

- The extension is named `saidomeio`.
- The name comes from "sai do meio": get out of the way.
- Keep the Brazilian/Northeastern character of the project where it fits.
- Avoid making the extension feel overly literal or generic.
- Prefer asking clarifying questions over making assumptions.

## Site Configuration Model

- Do not use separate allow/block lists.
- Do not use a global "run everywhere" policy.
- The extension should run only on sites explicitly listed by the user.
- Use a single configurable site list.
- Default sites should be actual list items, not placeholders.
- Current defaults:
  - `ge.globo.com`
  - `g1.globo.com`
  - `dailyhive.com`
  - `omelete.com.br`
- A current-site control should be a single contextual button:
  - add the current site if it is not listed
  - remove the current site if it is already listed
- There is no need for a separate current-site policy section.

## Options UI

- The sites should be displayed as editable list items.
- Each site row should have controls on the far right:
  - an `X` button to remove it
  - a pencil button to edit it
- The default sites should appear in the list itself.
- Avoid representing important defaults only as placeholder text.

## Popup Handling

- The extension should handle overlays/popups like:
  - Globo notification pre-prompts such as "Deseja receber as noticias mais importantes em tempo real? Ative as notificacoes do G1!"
  - "Agora nao" / "Ativar" notification prompts
  - similar prompts on sites like `omelete.com.br`
- It does not have to close every popup automatically.
- `Escape` can be used as a manual close/dismiss fallback.

## Icon Direction

- The approved icon concept is a simplified trash bin inside a popup-like square.
- The icon should have a transparent background.
- The prompt that generated the approved icon should stay saved in the repo.
- The visual direction should stay simple enough to work as a browser extension icon.
- Xilogravura / cordel / Northeastern Brazilian visual references are preferred.
- Avoid overly literal scenes such as a full hand pushing a popup.
- Avoid unnecessary color; monochrome is acceptable.

## GitHub

- The repository is public.
- Repository URL: `https://github.com/virgs/saidomeio`
