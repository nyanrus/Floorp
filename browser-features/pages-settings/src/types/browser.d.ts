export {};
declare global {
  var NRRestartBrowser: () => void;
  interface Window {
    NROpenExternalLink?: (url: string) => void;
  }
}
