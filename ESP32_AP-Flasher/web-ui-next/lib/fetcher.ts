export async function fetcher<T=any>(url:string, init?:RequestInit):Promise<T>{
  const res = await fetch(url, { cache:'no-store', ...init });
  if(!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}
