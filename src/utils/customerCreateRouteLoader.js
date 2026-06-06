export function createRetryableImporter(importer, cacheKey) {
  return async () => {
    try {
      const loaded = await importer();
      if (typeof window !== "undefined") {
        window.sessionStorage?.removeItem(cacheKey);
      }
      return loaded;
    } catch (error) {
      if (typeof window !== "undefined") {
        const alreadyRetried = window.sessionStorage?.getItem(cacheKey) === "1";
        if (!alreadyRetried) {
          window.sessionStorage?.setItem(cacheKey, "1");
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  };
}

export const importCustomerCreatePageWithRetry = createRetryableImporter(
  () => import("../pages/CustomerCreatePage"),
  "lazy:customer-create-page"
);

export async function preloadCustomerCreatePage() {
  try {
    await import("../pages/CustomerCreatePage");
  } catch (error) {
    console.warn("Customer creation preload skipped", error);
  }
}
