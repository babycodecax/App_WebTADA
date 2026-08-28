import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: 'TADA',
  description: 'Dịch Vụ Thuế Kế Toán TADA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
