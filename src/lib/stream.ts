export type Stream = { provider: "youtube" | "twitch"; id: string };

/** Reconoce enlaces de YouTube (video o live) y de canales de Twitch. Cualquier otro devuelve null. */
export function parseStream(raw: string | null | undefined): Stream | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com") {
    const id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "twitch.tv") {
    const channel = url.pathname.split("/")[1];
    return channel && /^\w{3,25}$/.test(channel) ? { provider: "twitch", id: channel } : null;
  }
  return null;
}

/** URL del reproductor integrado. Twitch exige indicar el dominio donde se incrusta. */
export function embedUrl(s: Stream, parentHost: string) {
  return s.provider === "youtube"
    ? `https://www.youtube.com/embed/${s.id}`
    : `https://player.twitch.tv/?channel=${s.id}&parent=${parentHost}`;
}
