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
System(bank, "Internet Banking System", "Allows customers to manage accounts")
System_Ext(mail, "E-mail System", "Sends notifications")

Rel(customer, bank, "Uses")
Rel(bank, mail, "Sends e-mail using")
@enduml
`,
  "c4-container": `@startuml
title Online Banking — Containers

Person(customer, "Customer")
System_Boundary(bank, "Internet Banking System") {
  Container(web, "Web App", "JS / SPA", "Delivers static content")
  Container(api, "API", "Java/Spring", "Provides banking functionality")
  ContainerDb(db, "Database", "PostgreSQL", "Stores accounts, transactions")
}

Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads/Writes", "JDBC")
@enduml
`,
  "c4-component": `@startuml
title Online Banking — Components

Container(api, "API")
Component(controller, "AccountsController", "Spring MVC", "REST endpoint")
Component(service, "AccountService", "Spring Bean", "Business rules")
ComponentDb(repo, "AccountRepository", "Spring Data JPA")

Rel(controller, service, "uses")
Rel(service, repo, "reads / writes")
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
