// Client safe branding fallbacks. This module must stay free of server
// imports such as prisma so browser components can use these constants
// without pulling the database driver into the client graph.

export const FALLBACK_SCHOOL_NAME = "Zenith Crown Academy";

export const FALLBACK_LOGO_PATH = "/logo-mark.png";
