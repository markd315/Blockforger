# Airline Tenant Schemas

This directory contains JSON schemas for the airline tenant, defining the structure for airline operations including flights, routes, airports, and personnel.

## Schema Overview

### Core Schemas

- **`airline.json`** - Main airline company schema
  - Required: flightRoutes (min 1), brandLink, hub
  - Optional: None

- **`flightRoute.json`** - Flight route between airports
  - Required: departureAirport, arrivalAirport, distance, isInternational
  - Optional: schedule, flights

- **`airport.json`** - Airport information
  - Required: location, code, fullName
  - Optional: None

- **`flight.json`** - Individual flight details
  - Required: pilots (min 2), crew, startTime, endTime
  - Optional: passengers, cargo

### Supporting Schemas

- **`pilot.json`** - Pilot information
  - Required: name, licenseNumber, rank, flightHours
  - Optional: None

- **`crewMember.json`** - Flight crew member
  - Required: name, role, employeeId
  - Optional: None

- **`passenger.json`** - Passenger information
  - Required: name, row, seat, fare
  - Optional: ktn, passportNumber, cargo

- **`cargo.json** - Cargo information
  - Required: type (enum: carryOn/checked), weight
  - Optional: None

- **`schedule.json`** - Flight schedule
  - Required: cron, flightNumber
  - Optional: None

## Schema Relationships

```
airline
├── flightRoutes[] → flightRoute
│   ├── departureAirport → airport
│   ├── arrivalAirport → airport
│   ├── schedule → schedule (optional)
│   └── flights[] → flight (optional)
│       ├── pilots[] → pilot (min 2)
│       ├── crew[] → crewMember
│       ├── passengers[] → passenger (optional)
│       │   └── cargo → cargo (optional)
│       └── cargo[] → cargo (optional)
└── hub → airport
```

## Validation Rules

- All required fields must be present
- Arrays with `minItems` constraints must meet minimum requirements
- ISO date-time format required for flight start/end times
- Enum values must match specified options (e.g., cargo type)
- References must point to valid schema files

## Usage

These schemas are automatically loaded by the S3BlockLoader and integrated with:
- Blockly block generation
- AJV validation
- JSON generation from blocks
- API request validation 