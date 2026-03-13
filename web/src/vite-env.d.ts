/// <reference types="vite/client" />

// Vite ?url imports return the resolved URL string
declare module '*.css?url' {
  const url: string
  export default url
}
