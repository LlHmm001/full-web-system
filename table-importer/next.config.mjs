/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs", "pg", "quickjs-emscripten"]
};

export default nextConfig;
