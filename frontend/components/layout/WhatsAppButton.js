export default function WhatsAppButton({ number }) {
  const digits = String(number).replace(/\D/g, '');
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent('Hello DareDevil Gears, I have a question.')}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1F8B4C] text-white shadow-lg hover:bg-[#18733e] sm:bottom-6 sm:right-6"
      aria-label="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.42 1.3-1.95 1.34-.5.04-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.99.95-2.26.24-.27.53-.34.71-.34l.51.01c.16 0 .38-.06.6.46.23.54.77 1.87.84 2.01.07.13.11.29.02.47-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.55.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.43.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.57.74 1.84.88.27.13.45.2.51.31.07.11.07.65-.17 1.33Z" />
      </svg>
    </a>
  );
}
