@id("dns.read")
permit (
    principal is ExampleCo::DNS::User,
    action == ExampleCo::DNS::Action::"read",
    resource is ExampleCo::DNS::Host
);
