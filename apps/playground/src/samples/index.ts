import type { DiagramType } from "@uml-drawer/core/model";

/**
 * Sample diagrams — one per supported type. The breadcrumb in the
 * playground topbar lets the user round-trip through them. Each sample
 * is a small but realistic snippet so the editor renders something
 * meaningful in every diagram type without further interaction.
 */
export const SAMPLES: Record<DiagramType, string> = {
  "c4-context": `@startuml
title Online Banking — Context

Person(customer, "Customer", "Personal banking customer")
Person_Ext(auditor, "External Auditor", "Reviews bank operations")
System(bank, "Internet Banking System", "Allows customers to manage accounts")
System_Ext(mail, "E-mail System", "Sends notifications")
SystemDb(audit_db, "Audit Log", "Stores audit trails")

Rel(customer, bank, "Uses")
Rel(bank, mail, "Sends e-mail using")
Rel(bank, audit_db, "Writes audit events to")
Rel(auditor, audit_db, "Inspects")
@enduml
`,
  "c4-container": `@startuml
title Online Banking — Containers

Person(customer, "Customer", "Personal banking customer")
System_Ext(mail, "E-mail System", "Sends notifications")
System_Boundary(bank, "Internet Banking System") {
  Container(web, "Web App", "JS / SPA", "Delivers static content")
  Container(api, "API", "Java/Spring", "Provides banking functionality")
  ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")
  ContainerQueue(events, "Domain Events", "Kafka", "Publishes account events")
}
Container_Ext(payments, "Payments Gateway", "REST", "Third-party processor")

Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads/Writes", "JDBC")
Rel(api, events, "Publishes to", "Kafka")
Rel(api, payments, "Charges via", "HTTPS")
Rel(api, mail, "Sends notifications via", "SMTP")
@enduml
`,
  "c4-component": `@startuml
title Online Banking — API Components

Person(customer, "Customer", "Personal banking customer")
ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")
Container_Boundary(api, "API Application") {
  Component(controller, "Accounts Controller", "Spring MVC", "REST endpoint for accounts")
  Component(security, "Security Component", "Spring", "Authenticates users")
  Component(service, "Account Service", "Spring Bean", "Business rules")
  ComponentDb(repo, "Account Repository", "Spring Data JPA", "Persistence")
  ComponentQueue(events, "Event Publisher", "Kafka", "Publishes domain events")
}
Component_Ext(payments, "Payments Gateway Client", "REST", "Wraps third-party API")

Rel(customer, controller, "Uses", "JSON/HTTPS")
Rel(controller, security, "Uses")
Rel(controller, service, "Uses")
Rel(service, repo, "Reads/Writes")
Rel(service, events, "Publishes to")
Rel(service, payments, "Charges via", "HTTPS")
Rel(repo, db, "Reads/Writes", "JDBC")
@enduml
`,
  class: `@startuml
title Order Management

class Customer {
}
class Order {
}
class Product
class Invoice

Customer "1" --> "*" Order : places
Order "*" --> "*" Product : contains
Order --> Invoice : produces
@enduml
`,
  er: `@startuml
title Domain — ER

entity User
entity Account
entity Transaction
entity Card

User ||--o{ Account : owns
Account ||--o{ Transaction : posts
Account ||--o{ Card : issues
@enduml
`,
  sequence: `@startuml
title Login Flow

actor User
participant "Web App" as web
participant API as api
participant Auth as auth

User -> web : login(email, password)
web -> api : POST /sessions
api -> auth : validate
auth --> api : ok(token)
api --> web : 201 { token }
web --> User : Welcome
@enduml
`,
};

export const DIAGRAM_TYPES: readonly DiagramType[] = [
  "c4-context",
  "c4-container",
  "c4-component",
  "class",
  "er",
  "sequence",
];

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  "c4-context": "C4 · Context",
  "c4-container": "C4 · Container",
  "c4-component": "C4 · Component",
  class: "Class",
  er: "Entity Relationship",
  sequence: "Sequence",
};
