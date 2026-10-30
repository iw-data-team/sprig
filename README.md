# Sprig

A small, keyboard-first mindmap editor. Vietnamese interface; powered by React, Vite and [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) (MIT).

- Start with a single editable topic. Double click or F2 to edit.
- Tab creates a child; Enter creates a sibling, including while typing. Enter at the root creates a child.
- Shift+Enter inserts a line break while editing. Esc cancels text edits.
- Change font size, weight, text and branch color; undo/redo, pan, zoom, collapse branches.
- Google login, private cloud maps, and per-project viewer/editor sharing through Supabase.
- Guest mode keeps maps in the current browser; signed-in users can import their guest maps.
- Export/import JSON for editable backups; export SVG/PNG for images.

## Development

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Open the URL Vite prints, under `/sprig/`. `dist/` is the complete static site. The base URL is configured in `vite.config.ts`.

## Hosting

Public deployment: https://iw-data-team.github.io/sprig/

GitHub Actions builds and deploys `main` to GitHub Pages. Public repositories and static Pages hosting are free within GitHub's [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits); no paid backend is required.

See [Cloud setup (Vietnamese)](docs/CLOUD_SETUP.md) to configure Supabase Free, Google OAuth, and the public GitHub Actions variables. Until configured, the site runs in guest mode. Authenticated map access is enforced by PostgreSQL RLS and version-checked RPCs. Sharing requires the invited Google account; a link alone grants no access. Concurrent edits produce a recoverable draft rather than silently overwriting another user's work. This version does not merge edits in real time.

Guest maps and unsynced recovery drafts remain in localStorage on each browser and origin. Export JSON regularly: clearing site data removes these local copies. JSON import accepts up to 5 MB, 3,000 nodes and 60 levels, and only a plain-text subset of engine data; cloud payloads are limited to 2 MiB.

## License

MIT. Third-party dependencies retain their respective licenses.
