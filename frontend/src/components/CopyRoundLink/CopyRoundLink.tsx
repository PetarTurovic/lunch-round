interface CopyRoundLinkProps {
  link: string;
  onCopy: () => void;
}

function CopyRoundLink({ link, onCopy }: CopyRoundLinkProps) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="mb-1 font-display text-sm font-bold">Share with your team</h2>
          <p className="mb-0 text-[9px] text-stone-500">Anyone with the link can join using their name.</p>
        </div>
        <button
          className="min-h-8 shrink-0 rounded-lg bg-lunch px-3 text-[9px] font-semibold text-white hover:bg-lunch-dark"
          type="button"
          onClick={onCopy}
        >
          Copy round link
        </button>
      </div>
      <p className="mb-0 mt-3 truncate rounded-md bg-stone-50 px-3 py-2 text-[9px] text-stone-500" title={link}>
        {link}
      </p>
    </article>
  );
}

export default CopyRoundLink;
