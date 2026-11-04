import Image from "next/image";
import logo from "../../public/brand/logo-cmdpro.png";

/** Logo officiel, affiché tel quel (fond blanc d'origine conservé, proportions intactes). */
export function Logo({ size = 48, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,0.25)]" style={{ width: size, height: size }}>
      <Image src={logo} alt="Logo CMD Pro — Centre Médical Dieu est Fidélité" priority={priority} sizes={`${size * 2}px`} className="h-auto w-full" />
    </span>
  );
}
