import type { Locator, Page } from "@playwright/test";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asRegex(label: string | RegExp): RegExp {
  return label instanceof RegExp ? label : new RegExp(escapeRegex(label), "i");
}

function labelLocator(root: Page | Locator, label: string | RegExp): Locator {
  return root.locator("label").filter({ hasText: asRegex(label) }).first();
}

function fieldRoot(root: Page | Locator, label: string | RegExp): Locator {
  return labelLocator(root, label).locator("xpath=..");
}

export function inputByLabel(root: Page | Locator, label: string | RegExp): Locator {
  return fieldRoot(root, label).locator("input,textarea").first();
}

export async function fillByLabel(root: Page | Locator, label: string | RegExp, value: string): Promise<void> {
  await inputByLabel(root, label).fill(value);
}

export async function selectNativeByLabel(root: Page | Locator, label: string | RegExp, value: string): Promise<void> {
  await fieldRoot(root, label).locator("select").first().selectOption(value);
}

export async function chooseSelectOption(root: Page | Locator, label: string | RegExp, option: string | RegExp): Promise<void> {
  const field = fieldRoot(root, label);
  const nativeSelect = field.locator("select").first();
  if ((await nativeSelect.count()) > 0 && typeof option === "string") {
    await nativeSelect
      .selectOption({ label: option })
      .catch(async () => nativeSelect.selectOption({ value: option.toLowerCase() }));
    return;
  }

  await field.locator('button,[role="combobox"]').first().click();
  const optRegex = option instanceof RegExp ? option : new RegExp(escapeRegex(option), "i");
  const optionScope: any = typeof (root as any).page === 'function' ? (root as any).page() : root;
  const optionLocator = optionScope.getByRole("option", { name: optRegex }).first();
  if ((await optionLocator.count()) > 0) {
    await optionLocator.click();
    return;
  }
  await optionScope.locator("[data-radix-collection-item]").filter({ hasText: optRegex }).first().click();
}

export function relativeAppUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
