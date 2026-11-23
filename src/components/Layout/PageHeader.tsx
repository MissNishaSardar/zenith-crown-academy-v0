type PageHeaderProps = {
  subtitle: string;
  title: string;
};

const PageHeader = ({ subtitle, title }: PageHeaderProps) => (
  <div className="flex flex-col gap-1">
    <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
      {title}
    </h1>
    <p className="text-muted-foreground text-sm">{subtitle}</p>
  </div>
);

export default PageHeader;
