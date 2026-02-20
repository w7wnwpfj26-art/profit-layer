import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const locales = ["zh-CN", "en"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const localeCookie = store.get("locale")?.value;
  const locale: Locale =
    localeCookie && locales.includes(localeCookie as Locale)
      ? (localeCookie as Locale)
      : "zh-CN";

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
