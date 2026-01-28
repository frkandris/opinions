import { test, expect } from "@playwright/test";

test.describe("Vélemények játék", () => {
  test("Home screen - csak kód input", async ({ page }) => {
    await page.goto("/");
    
    await expect(page.locator("h1")).toContainText("Vélemények");
    await expect(page.getByPlaceholder("KÓD")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tovább" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tovább" })).toBeDisabled();
    
    await page.screenshot({ path: "tests/screenshots/01-home.png", fullPage: true });
  });

  test("Kód beírása aktiválja a Tovább gombot", async ({ page }) => {
    await page.goto("/");
    
    const nextBtn = page.getByRole("button", { name: "Tovább" });
    await expect(nextBtn).toBeDisabled();
    
    await page.getByPlaceholder("KÓD").fill("ABCD");
    await expect(nextBtn).toBeEnabled();
    
    await page.screenshot({ path: "tests/screenshots/02-home-with-code.png", fullPage: true });
  });

  test("Hibás kód esetén hibaüzenet jelenik meg", async ({ page }) => {
    await page.goto("/");
    
    await page.getByPlaceholder("KÓD").fill("XXXX");
    await page.getByRole("button", { name: "Tovább" }).click();
    
    await expect(page.locator("text=Nincs ilyen kód")).toBeVisible({ timeout: 10000 });
    
    await page.screenshot({ path: "tests/screenshots/03-error-invalid-code.png", fullPage: true });
  });

  test("Admin oldal - szoba létrehozása", async ({ page }) => {
    await page.goto("/admin");
    
    await expect(page.locator("h1")).toContainText("Admin");
    await expect(page.getByRole("button", { name: "Szoba létrehozása" })).toBeVisible();
    
    await page.getByRole("button", { name: "Szoba létrehozása" }).click();
    
    // Várjuk meg a kód megjelenését
    await expect(page.locator("text=Szoba létrehozva")).toBeVisible({ timeout: 10000 });
    
    await page.screenshot({ path: "tests/screenshots/04-admin-room-created.png", fullPage: true });
  });

  test("Kilépés gomb visszavisz a főoldalra", async ({ browser }) => {
    // Admin létrehoz szobát
    const adminPage = await browser.newPage();
    await adminPage.goto("/admin");
    await adminPage.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(adminPage.locator("text=Szoba létrehozva")).toBeVisible({ timeout: 10000 });
    
    // Kód kinyerése
    const codeElement = adminPage.locator(".text-violet-400.font-mono");
    const gameCode = await codeElement.textContent();
    
    // Játékos csatlakozik
    const playerPage = await browser.newPage();
    await playerPage.goto("/");
    await playerPage.getByPlaceholder("KÓD").fill(gameCode!);
    await playerPage.getByRole("button", { name: "Tovább" }).click();
    
    // Név megadása
    await expect(playerPage.getByPlaceholder("Neved")).toBeVisible({ timeout: 10000 });
    await playerPage.getByPlaceholder("Neved").fill("Teszt");
    await playerPage.getByRole("button", { name: "Csatlakozás" }).click();
    
    // Lobby
    await expect(playerPage.locator("text=Teszt")).toBeVisible({ timeout: 10000 });
    
    // Kilépés gomb (✕)
    await playerPage.locator("button:has-text('✕')").click();
    
    // Visszakerültünk a főoldalra
    await expect(playerPage.getByPlaceholder("KÓD")).toBeVisible();
    
    await playerPage.screenshot({ path: "tests/screenshots/05-back-to-home.png", fullPage: true });
    
    await adminPage.close();
    await playerPage.close();
  });

  test("Két játékos csatlakozása és játék indítása", async ({ browser }) => {
    // Admin létrehoz szobát
    const adminPage = await browser.newPage();
    await adminPage.goto("/admin");
    await adminPage.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(adminPage.locator("text=Szoba létrehozva")).toBeVisible({ timeout: 10000 });
    
    // Kód kinyerése
    const codeElement = adminPage.locator(".text-violet-400.font-mono");
    const gameCode = await codeElement.textContent();
    
    await adminPage.screenshot({ path: "tests/screenshots/06-admin-created.png", fullPage: true });
    
    // Host böngésző
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    
    // Guest böngésző
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    
    // Host csatlakozik
    await hostPage.goto("/");
    await hostPage.getByPlaceholder("KÓD").fill(gameCode!);
    await hostPage.getByRole("button", { name: "Tovább" }).click();
    await expect(hostPage.getByPlaceholder("Neved")).toBeVisible({ timeout: 10000 });
    await hostPage.getByPlaceholder("Neved").fill("Host");
    await hostPage.getByRole("button", { name: "Csatlakozás" }).click();
    
    await expect(hostPage.locator("text=Host")).toBeVisible({ timeout: 10000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/07-host-lobby.png", fullPage: true });
    
    // Guest csatlakozik
    await guestPage.goto("/");
    await guestPage.getByPlaceholder("KÓD").fill(gameCode!);
    await guestPage.getByRole("button", { name: "Tovább" }).click();
    await expect(guestPage.getByPlaceholder("Neved")).toBeVisible({ timeout: 10000 });
    await guestPage.getByPlaceholder("Neved").fill("Guest");
    await guestPage.getByRole("button", { name: "Csatlakozás" }).click();
    
    await expect(guestPage.locator("text=Host")).toBeVisible({ timeout: 10000 });
    await expect(guestPage.locator("text=Guest")).toBeVisible();
    
    await guestPage.screenshot({ path: "tests/screenshots/08-guest-lobby.png", fullPage: true });
    
    // Host látja a guest-et (realtime)
    await expect(hostPage.locator("text=Guest")).toBeVisible({ timeout: 5000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/09-host-sees-guest.png", fullPage: true });
    
    // Host (első csatlakozó) indítja a játékot
    const startBtn = hostPage.getByRole("button", { name: "Indítás" });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    
    // Mindkét játékos az opinions fázisban van
    await expect(hostPage.getByPlaceholder("Írd ide a véleményed...")).toBeVisible({ timeout: 10000 });
    await expect(guestPage.getByPlaceholder("Írd ide a véleményed...")).toBeVisible({ timeout: 10000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/10-host-opinions.png", fullPage: true });
    await guestPage.screenshot({ path: "tests/screenshots/11-guest-opinions.png", fullPage: true });
    
    // Host beküld egy véleményt
    await hostPage.getByPlaceholder("Írd ide a véleményed...").fill("A pizza ananásszal a legjobb.");
    await hostPage.getByRole("button", { name: "Küldés" }).click();
    
    await expect(hostPage.locator("text=Elküldve")).toBeVisible({ timeout: 5000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/12-host-opinion-sent.png", fullPage: true });
    
    // Guest beküld egy véleményt
    await guestPage.getByPlaceholder("Írd ide a véleményed...").fill("A ketchup a tojásra való.");
    await guestPage.getByRole("button", { name: "Küldés" }).click();
    
    await expect(guestPage.locator("text=Elküldve")).toBeVisible({ timeout: 5000 });
    
    await guestPage.screenshot({ path: "tests/screenshots/13-guest-opinion-sent.png", fullPage: true });
    
    // Host látja a Tovább gombot
    await expect(hostPage.getByRole("button", { name: "Tovább" })).toBeVisible({ timeout: 5000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/14-host-ready-to-continue.png", fullPage: true });
    
    // Host továbblép a szavazásra
    await hostPage.getByRole("button", { name: "Tovább" }).click();
    
    // Mindkét játékos a play fázisban van
    await expect(hostPage.locator("text=Igen")).toBeVisible({ timeout: 10000 });
    await expect(guestPage.locator("text=Igen")).toBeVisible({ timeout: 10000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/15-host-voting.png", fullPage: true });
    await guestPage.screenshot({ path: "tests/screenshots/16-guest-voting.png", fullPage: true });
    
    // Host szavaz
    await hostPage.getByRole("button", { name: "Igen" }).click();
    await hostPage.locator("select").selectOption({ index: 1 });
    await hostPage.getByRole("button", { name: "Küldés" }).click();
    
    await expect(hostPage.locator("text=Szavaztál")).toBeVisible({ timeout: 5000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/17-host-voted.png", fullPage: true });
    
    // Guest szavaz
    await guestPage.getByRole("button", { name: "Nem" }).click();
    await guestPage.locator("select").selectOption({ index: 1 });
    await guestPage.getByRole("button", { name: "Küldés" }).click();
    
    await expect(guestPage.locator("text=Szavaztál")).toBeVisible({ timeout: 5000 });
    
    await guestPage.screenshot({ path: "tests/screenshots/18-guest-voted.png", fullPage: true });
    
    // Várjuk meg a következő állítást (2/2)
    await hostPage.waitForTimeout(2000);
    
    // Második állításra szavazás - host
    const hostIgenBtn2 = hostPage.getByRole("button", { name: "Igen" });
    if (await hostIgenBtn2.isVisible()) {
      await hostPage.getByRole("button", { name: "Nem" }).click();
      await hostPage.locator("select").selectOption({ index: 1 });
      await hostPage.getByRole("button", { name: "Küldés" }).click();
      await hostPage.waitForTimeout(1000);
    }
    
    // Második állításra szavazás - guest
    await guestPage.waitForTimeout(2000);
    const guestIgenBtn2 = guestPage.getByRole("button", { name: "Igen" });
    if (await guestIgenBtn2.isVisible()) {
      await guestPage.getByRole("button", { name: "Igen" }).click();
      await guestPage.locator("select").selectOption({ index: 1 });
      await guestPage.getByRole("button", { name: "Küldés" }).click();
      await guestPage.waitForTimeout(1000);
    }
    
    // Eredmények megjelennek (vagy már megjelentek)
    await hostPage.waitForTimeout(3000);
    await hostPage.screenshot({ path: "tests/screenshots/19-host-final.png", fullPage: true });
    await guestPage.screenshot({ path: "tests/screenshots/20-guest-final.png", fullPage: true });
    
    // Cleanup
    await hostContext.close();
    await guestContext.close();
  });
});
