@id("identity.view")
permit (
    principal is ExampleCo::Identity::User,
    action == ExampleCo::Identity::Action::"view",
    resource is ExampleCo::Identity::Tenant
);
