import Head from 'next/head';

interface SeoProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  noIndex?: boolean;
}

export function Seo({ title='OpenEPaperLink', description, url, image='/og.png', noIndex }: SeoProps){
  return (
    <Head>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      <meta property="og:type" content="website" />
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      {image && <meta name="twitter:image" content={image} />}
    </Head>
  );
}
