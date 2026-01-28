import { test, expect } from "@playwright/test";

test.describe("Vélemények játék", () => {
  test("Home screen megjelenik", async ({ page }) => {
    await page.goto("/");
    
    await expect(page.locator("h1")).toContainText("Vélemények");
    await expect(page.getByPlaceholder("Neved")).toBeVisible();
    await expect(page.getByPlaceholder("Kód")).toBeVisible();
    await expect(page.getByRole("button", { name: "Új játék" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Csatlakozás" })).toBeVisible();
    
    await page.screenshot({ path: "tests/screenshots/01-home.png", fullPage: true });
  });

  test("Név megadása aktiválja az Új játék gombot", async ({ page }) => {
    await page.goto("/");
    
    const newGameBtn = page.getByRole("button", { name: "Új játék" });
    await expect(newGameBtn).toBeDisabled();
    
    await page.getByPlaceholder("Neved").fill("Teszt Játékos");
    await expect(newGameBtn).toBeEnabled();
    
    await page.screenshot({ path: "tests/screenshots/02-home-with-name.png", fullPage: true });
  });

  test("Csatlakozás gomb csak kóddal és névvel aktív", async ({ page }) => {
    await page.goto("/");
    
    const joinBtn = page.getByRole("button", { name: "Csatlakozás" });
    await expect(joinBtn).toBeDisabled();
    
    await page.getByPlaceholder("Neved").fill("Teszt");
    await expect(joinBtn).toBeDisabled();
    
    await page.getByPlaceholder("Kód").fill("ABCD");
    await expect(joinBtn).toBeEnabled();
    
    await page.screenshot({ path: "tests/screenshots/03-home-ready-to-join.png", fullPage: true });
  });

  test("Hibás kód esetén hibaüzenet jelenik meg", async ({ page }) => {
    await page.goto("/");
    
    await page.getByPlaceholder("Neved").fill("Teszt");
    await page.getByPlaceholder("Kód").fill("XXXX");
    await page.getByRole("button", { name: "Csatlakozás" }).click();
    
    await expect(page.locator("text=nem található")).toBeVisible({ timeout: 10000 });
    
    await page.screenshot({ path: "tests/screenshots/04-error-invalid-code.png", fullPage: true });
  });

  test("Játék létrehozása és lobby megjelenítése", async ({ page }) => {
    await page.goto("/");
    
    await page.getByPlaceholder("Neved").fill("Host Játékos");
    await page.getByRole("button", { name: "Új játék" }).click();
    
    // Várjuk meg a lobby-t
    await expect(page.locator("text=Kód")).toBeVisible({ timeout: 10000 });
    
    // Ellenőrizzük, hogy a játékos neve megjelenik
    await expect(page.locator("text=Host Játékos")).toBeVisible();
    
    // Host korona
    await expect(page.locator("text=👑")).toBeVisible();
    
    // Indítás gomb (disabled, mert egyedül van)
    const startBtn = page.getByRole("button", { name: "Indítás" });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeDisabled();
    
    await page.screenshot({ path: "tests/screenshots/05-lobby-single-player.png", fullPage: true });
  });

  test("Kilépés gomb visszavisz a főoldalra", async ({ page }) => {
    await page.goto("/");
    
    await page.getByPlaceholder("Neved").fill("Kilépő");
    await page.getByRole("button", { name: "Új játék" }).click();
    
    await expect(page.locator("text=Kód")).toBeVisible({ timeout: 10000 });
    
    // Kilépés gomb (✕)
    await page.locator("button:has-text('✕')").click();
    
    // Visszakerültünk a főoldalra
    await expect(page.getByRole("button", { name: "Új játék" })).toBeVisible();
    
    await page.screenshot({ path: "tests/screenshots/06-back-to-home.png", fullPage: true });
  });

  test("Két játékos csatlakozása és játék indítása", async ({ browser }) => {
    // Host böngésző
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    
    // Guest böngésző
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    
    // Host létrehozza a játékot
    await hostPage.goto("/");
    await hostPage.getByPlaceholder("Neved").fill("Host");
    await hostPage.getByRole("button", { name: "Új játék" }).click();
    
    await expect(hostPage.locator("text=Kód")).toBeVisible({ timeout: 10000 });
    
    // Kód kinyerése
    const codeElement = hostPage.locator(".text-violet-400.font-mono");
    const gameCode = await codeElement.textContent();
    
    await hostPage.screenshot({ path: "tests/screenshots/07-host-lobby.png", fullPage: true });
    
    // Guest csatlakozik
    await guestPage.goto("/");
    await guestPage.getByPlaceholder("Neved").fill("Guest");
    await guestPage.getByPlaceholder("Kód").fill(gameCode!);
    await guestPage.getByRole("button", { name: "Csatlakozás" }).click();
    
    await expect(guestPage.locator("text=Host")).toBeVisible({ timeout: 10000 });
    await expect(guestPage.locator("text=Guest")).toBeVisible();
    
    await guestPage.screenshot({ path: "tests/screenshots/08-guest-lobby.png", fullPage: true });
    
    // Host látja a guest-et (realtime)
    await expect(hostPage.locator("text=Guest")).toBeVisible({ timeout: 5000 });
    
    await hostPage.screenshot({ path: "tests/screenshots/09-host-sees-guest.png", fullPage: true });
    
    // Host indítja a játékot
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
