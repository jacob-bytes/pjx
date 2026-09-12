/**
 * 项目内统一的 class 合并入口。
 *
 * 走 `cn` 包（零依赖、编译版引擎），与 shadcn 的 `components/ui/*` 保持同一实现，
 * 避免同时打包 tailwind-merge 与 cn 两套引擎。
 */
export { cn } from "cn"
