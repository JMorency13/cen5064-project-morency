# Creational Pattern Map

| Pattern | Genuine home in this system |
|---|---|
| Factory Method | No genuine fit: event and service creation use functions, not subclasses choosing one product through an overridable factory method. |
| Abstract Factory | No genuine fit: the system has no matching families of related products that need a shared creation interface. |
| Builder | No genuine fit: event creation assembles one fixed event shape in one step, with no meaningful staged construction process. |
| Prototype | No genuine fit: event updates use object spreads, but the system has no copy/clone operation for creating new objects from prototypes. |
| Singleton | `src/data/eventStore.js` owns the shared event collection and persistence path, so the application uses one repository instance. |

## Best fit: Singleton

`EventStore.getInstance()` provides the one shared event repository used by the application, preserving its existing `init`, `findAll`, `save`, `update`, and `clear` API. This avoids separate repository instances maintaining divergent event state or persistence configuration.
