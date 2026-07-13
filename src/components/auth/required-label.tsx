/** Field label with red * for compulsory fields */
export function RequiredLabel({
  children,
  className = "mb-0.5 block text-[11px] font-semibold text-[#475569]",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={className}>
      {children}
      <span className="ml-0.5 font-bold text-red-600" aria-hidden>
        *
      </span>
    </span>
  );
}
