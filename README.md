# Civil Registry Frontend

## Project notes

### Shared asset policy

This app keeps static assets that need a stable URL in `public/` (for example, the favicon or other files referenced directly from `index.html` or by absolute URL). Component-scoped images should be imported from `src/assets` so Vite can process and hash them during the build.

`dist/` is a generated Vite build artifact and should not be committed. The repo is configured to ignore it via `.gitignore`.

### VitalRecords styling

The Birth, Death, and Marriage verifier screens intentionally share a single stylesheet at `src/pages/VitalRecords/VitalRecords.css`. This is not an oversight: each screen imports the same parent stylesheet instead of maintaining separate CSS files for the common layout and print styles.

### Reusable UI and helper structure

`src/components` is reserved for shared UI pieces such as buttons, modals, sidebars, or nav elements once they are extracted from page-level code. `src/hooks` and `src/utils` are the intended home for custom hooks and helper logic as the app grows.

### Vite dist vs root HTML

The root `index.html` is the app template used by Vite during local development, while `dist/index.html` is the generated production build output. Both are expected to coexist during development/builds, and the build output should remain untracked.
