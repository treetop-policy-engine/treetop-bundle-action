@id("dns.read")
permit (
    principal is ExampleCo::Identity::User,
    action == ExampleCo::DNS::Action::"read",
    resource is ExampleCo::DNS::Host
);
