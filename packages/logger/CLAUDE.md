# Logging Utilities

## 目录说明

`packages/logger` 提供跨应用的日志能力。

## 当前结构

```
src/
├── index.ts      # 统一导出
├── core.ts       # 日志核心（级别、格式化）
├── config.ts     # 配置（环境变量覆盖）
├── transports.ts # 输出目标（console、file）
└── utils/        # 工具函数
```

## 测试

Logger 是项目中唯一有测试的包，测试位于 `src/__tests__/`。
