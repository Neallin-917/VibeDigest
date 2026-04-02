# E2E Testing with Playwright

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run specific test
```bash
npx playwright test e2e/workflow-complete.spec.ts
```

### Run with UI Mode (Debugging)
```bash
npx playwright test --ui
```

### Update Visual Snapshots
```bash
npx playwright test --update-snapshots
```

## Architecture

### Page Object Model (POM)
We use the Page Object Model pattern to organize test interactions.
Page objects are located in `e2e/pages/`.
- `AuthPage`: Login interactions
- `ChatPage`: Chat interface interactions
- `TaskPage`: Task card and details interactions
- `SettingsPage`: Settings page interactions

### Test Data Factory
We use a factory pattern to generate mock data.
Located in `e2e/fixtures/testData.ts`.
Use `createMockTask`, `createMockUser`, etc., to generate consistent data objects.

### Browser Support
- **Chromium**: Runs all tests (Guest + Authenticated + Setup)
- **Firefox**: Runs smoke/workflow tests only (to save CI time)
- **WebKit (Safari)**: Runs smoke/workflow tests only (to save CI time)

## CI Configuration
- CI runs `npx playwright test`.
- Uses `NEXT_PUBLIC_E2E_MOCK=1` to mock backend interactions.
- `auth.setup.ts` mocks Supabase Auth network requests to ensure stability in CI without real credentials.
