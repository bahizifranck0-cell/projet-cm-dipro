/* Photo d'employé servie par une route protégée ; initiales à défaut. */
export function Avatar({ employeeId, hasPhoto, name, size = 40 }: { employeeId?: string | null; hasPhoto?: boolean; name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const style = { width: size, height: size };
  if (employeeId && hasPhoto)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/fichiers/employes/${employeeId}/photo`} alt={`Photo de ${name}`} style={style} className="shrink-0 rounded-full border border-white/30 object-cover" />;
  return (
    <span style={{ ...style, fontSize: size * 0.38 }} aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/25 bg-brand-600/50 font-semibold">
      {initials || "?"}
    </span>
  );
}
