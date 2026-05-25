# Documentation Index

Welcome to the license-tool documentation. This directory contains comprehensive guides about how the system works internally.

## Documents

### [Architecture Overview](./architecture.md)
**Purpose**: Understand the overall system design

**Contents**:
- General structure and components
- Directory organization
- Key components breakdown
- Data flow diagram
- Configuration options

**Read this if**: You want to understand how all the pieces fit together

---

### [Request Flow](./request-flow.md)
**Purpose**: Follow a request from start to finish

**Contents**:
- Complete processing workflow
- Step-by-step execution flow
- Entry points (CLI vs Library)
- Package detection and validation
- Dependency extraction
- License resolution
- Document generation
- Check mode vs Generate mode
- Error handling and retries
- Performance optimizations

**Read this if**: You want to understand what happens when you run `npx license-tool`

---

### [Harvest & Transitive Dependencies](./harvest.md)
**Purpose**: Understand `--harvest` mode and automatic transitive dependency handling

**Contents**:
- What ClearlyDefined harvesting is and how it works
- How transitive (indirect) deps are detected and suppressed from `problems.md`
- Behaviour table: direct vs transitive in generate / check / harvest modes
- Best practices and rate limits

**Read this if**: You want to understand `--harvest`, or why some unresolved deps don't fail the build

---

### [Package Managers](./package-managers.md)
**Purpose**: Understand how each package manager is implemented

**Contents**:
- Package manager separation architecture
- Base class (PackageManagerBase)
- npm implementation details
- Yarn v1 implementation details
- Yarn 3+ implementation details
- Comparison matrix
- How to add a new package manager

**Read this if**: You want to understand how npm/yarn support works or add a new package manager

---

## Quick Navigation

### For Contributors

- **Adding a feature**: Start with [Architecture](./architecture.md)
- **Debugging an issue**: Check [Request Flow](./request-flow.md)
- **Adding package manager**: Read [Package Managers](./package-managers.md)
- **Understanding transitive deps**: Read [Harvest & Transitive Dependencies](./harvest.md)

### For Users

- **How it works**: [Architecture](./architecture.md) → [Request Flow](./request-flow.md)
- **Understanding output**: [Request Flow](./request-flow.md) section 6-7

---

## Additional Resources

- **Main README**: `../README.md` - Installation and usage
- **API Docs**: See TypeScript interfaces in source code
- **Tests**: `../src/**/__tests__/` - Example usage patterns
