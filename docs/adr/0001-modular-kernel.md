# ADR 0001: TypeScript modular kernel

Status: accepted for experimental v0.1.

Use TypeScript and Node 22+. Keep action, provider, and UI contracts in a dependency-free core. Isolate AJV validation, in-memory registration, server execution, and rendering in separate npm packages. React is the first renderer; Adobe Spectrum is optional. A deterministic demo provider makes development work without credentials.

This keeps applications independent of any particular LLM, database, renderer, or hosted platform. Additional packages and adapters must justify their dependencies. The cost is explicit package build ordering and an experimental compatibility surface until v1.0.
