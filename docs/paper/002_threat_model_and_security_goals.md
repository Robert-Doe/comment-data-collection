# Threat Model And Security Goals

## Security motivation

The long-term security motivation is to identify where untrusted user-generated content enters or is rendered in the DOM so that defensive controls can focus on the most relevant region before XSS-style damage occurs.

## Primary asset

The primary asset is:

- the integrity of the rendered page and its client-side execution environment

## Main concern

The main concern is:

- comment-like UGC regions can carry or display attacker-controlled input

## Defensive goal

The system aims to:

- localize the DOM subgraphs most likely to contain risky UGC
- reduce the search space for defensive instrumentation
- support preemptive security decisions around the right DOM region

## In scope

- comment threads
- reply chains
- review sections
- forum discussion blocks
- similar repeated UGC structures

## Out of scope for current model design

- CAPTCHA solving
- access-control bypass
- login-wall handling
- complete exploit detection
- direct XSS payload classification

## Core security assumption

If the system can reliably identify the real UGC-bearing DOM region, later defenses can be attached more precisely and more cheaply than page-wide blanket treatment.
