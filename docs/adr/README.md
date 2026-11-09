# Architecture decision records

The numbers are not contiguous: 1, 6 to 10 and 12 recorded the toolchains of earlier implementations, and were retired with them.

ADRs 2 to 5, 11 and 13 are decisions about the domain. They outlived the implementations they were written in, so they still apply,
and where they name a path or a function of an earlier one, read its Java counterpart: `parseWorld` is `WorldParser`, `reach()` is
`Reachability.walk`, `generate` is `Generator.generate`, and `GENERATOR_VERSION` is `Generator.VERSION`.
