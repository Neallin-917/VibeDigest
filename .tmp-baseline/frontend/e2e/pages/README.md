# Page Object Models

This directory contains Page Object Model (POM) classes for Playwright E2E tests.

## Purpose
POM reduces code duplication and improves maintenance by encapsulating page-specific selectors and interactions in reusable classes.

## Usage
Import the page class in your test file:

```typescript
import { ChatPage } from './pages/ChatPage';

test('example', async ({ page }) => {
  const chatPage = new ChatPage(page);
  await chatPage.goto();
  await chatPage.submitMessage('Hello');
});
```

## Best Practices
1. **Encapsulation**: Tests should not interact with locators directly if a Page Object exists.
2. **Readability**: Methods should represent user actions (`submitMessage`, `login`) rather than implementation details (`clickButton`, `typeInput`).
3. **Assertions**: It is acceptable to have assertions inside Page Objects (`expectMessageVisible`) or return Locators for assertions in the test.
