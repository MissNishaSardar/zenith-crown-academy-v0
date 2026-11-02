import Image from "next/image";
import Link from "next/link";
import ThemeToggleButton from "./ThemeToggleButton";

const Header = () => {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 h-16 border-b backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Zenith Crown Academy home"
          className="flex items-center gap-2.5">
          <Image
            src={"/logo-mark.png"}
            alt={""}
            width={954}
            height={561}
            priority
            className="h-9 w-auto"
          />
          <span className="font-heading text-foreground text-base leading-none font-bold tracking-tight sm:text-lg">
            Zenith Crown{" "}
            <span className="text-muted-foreground font-semibold">Academy</span>
          </span>
        </Link>
        <ThemeToggleButton />
      </div>
    </header>
  );
};

export default Header;
