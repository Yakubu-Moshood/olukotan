/** Tools → Thesaurus: online lookup via the free Datamuse API (needs an internet connection). */
export interface ThesaurusResult { synonyms: string[]; related: string[]; antonyms: string[] }

export async function lookUpWord(word: string, fetcher: typeof fetch = fetch): Promise<ThesaurusResult> {
  const query = encodeURIComponent(word.trim().toLowerCase());
  const get = async (params: string) => {
    const response = await fetcher(`https://api.datamuse.com/words?${params}&max=40`);
    if (!response.ok) throw new Error("The thesaurus service didn't respond. Check your internet connection.");
    return ((await response.json()) as { word: string }[]).map((item) => item.word);
  };
  try {
    const [synonyms, related, antonyms] = await Promise.all([get(`rel_syn=${query}`), get(`ml=${query}`), get(`rel_ant=${query}`)]);
    return { synonyms, related: related.filter((item) => !synonyms.includes(item)).slice(0, 30), antonyms };
  } catch (reason) {
    throw reason instanceof Error && reason.message.includes("thesaurus") ? reason : new Error("The thesaurus needs an internet connection. You're offline, or the service is unavailable.");
  }
}
