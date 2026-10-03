/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Emoji dùng font Noto Color Emoji để hiển thị giống nhau trên mọi máy (kể cả Windows 10 cũ)
        game: ['"Baloo 2"', '"Noto Color Emoji"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
        floatUp: { '0%': { transform: 'translateY(0)', opacity: '1' }, '100%': { transform: 'translateY(-40px)', opacity: '0' } },
        // Triệu hồi: vòng ngọc quay nhanh dần và thu nhỏ về giữa
        orbit: { '0%': { transform: 'rotate(0deg) scale(1)' }, '100%': { transform: 'rotate(1080deg) scale(0.15)' } },
        converge: { '0%,60%': { opacity: '1' }, '100%': { opacity: '0.2' } },
      },
      animation: {
        orbit: 'orbit 2.6s cubic-bezier(.5,0,.9,.6) forwards',
        converge: 'converge 2.6s ease-in forwards',
        pop: 'pop .25s ease-out',
        shake: 'shake .3s ease-in-out 2',
        floatUp: 'floatUp 1s ease-out forwards',
      },
    },
  },
  plugins: [],
};
