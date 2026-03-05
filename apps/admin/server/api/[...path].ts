/* eslint-disable no-undef */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const apiBaseUrl = config.public.apiBaseUrl as string | undefined;

  if (!apiBaseUrl) {
    throw createError({
      statusCode: 500,
      message: "API base URL is not configured",
    });
  }

  const rawPath = event.context.params?.path;
  const resolvedPath = Array.isArray(rawPath)
    ? rawPath.join("/")
    : rawPath || "";
  const trimmedPath = resolvedPath.replace(/^\/+/, "");
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const target = new URL(trimmedPath, base);

  const query = getQuery(event);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => target.searchParams.append(key, String(entry)));
    } else if (value !== undefined) {
      target.searchParams.set(key, String(value));
    }
  }

  const method = event.method;
  const headers: Record<string, string> = {};
  const auth = getRequestHeader(event, "authorization");
  const contentType = getRequestHeader(event, "content-type");

  if (auth) headers.authorization = auth;
  if (contentType) headers["content-type"] = contentType;

  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRawBody(event);

  const response = await fetch(target.toString(), {
    method,
    headers,
    body: body || undefined,
  });

  setResponseStatus(event, response.status);
  const responseType = response.headers.get("content-type") || "";
  const payload = responseType.includes("application/json")
    ? await response.json()
    : await response.text();

  const responseContentType = response.headers.get("content-type");
  if (responseContentType) {
    setResponseHeader(event, "content-type", responseContentType);
  }

  return payload;
});
