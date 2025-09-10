# Temporally Embedded LLM-based Applications with State2Props

i am imagining a deterministic system with a deterministic transition function that takes current state
and computes the evolution of the system.

this is already the case for a chatbot in which the llm is viewed as deterministic, but the main problem in our case is time.

there are various benefits of having such a deterministic setup, including testability and trainability, but i will focus instead on how it might actually be implemented in a good way.

consider the chat history as a sequence of messages (including tool requests and responses) that are time labelled. this is the main part of the state.

unlike the scenario which is common until now, that tool responses are immediate and therefore not asynchronous, we will be dealing with many scenarios in which this is not the case. for example consider a simple countdown timer. the naive implementation of a countdown timer uses a startTimer(5 minutes) tool call and has a react component for that countdown timer. this is fine for simple cases, but the problem is state. if there is a refreshing of the site, if the user switches from desktop to mobile, if the rl training system does not want to wait 5 minutes etc it is not working.

the current value of the timer is instead a function of state and current time. It is deterministically computable whether or not there is still an active timer and what the current countdown value is, as a function of the chat history in which the tool response is labelled with a timestamp for when the timer was started.

let us consider a few more cases.

consider setting a reminder notification in 10 minutes. this is very similar to the timer. at any time, it is computable whether the reminder has appeared or not.

for both a timer and a notification we might imagine actions or interventions, such as pausing the timer, removing or closing the reminder. these actions will have to be included in the sequence of events. the standard formulation of chat completions and tool use do not naturally support this situation.

i suggest using messages with role:system for this use case. role:system messages might contain human-llm-and-machine-readable content such as json, that helps specify state, such as the pausing of a certain timer at a given timestamp.

## Types
we can now move on to consider in more detail how such a machine will be realized. i will start by using a more abstract model.

State: the state is given by a chat conversation history of timestamp labelled events
Time: time is represented by a timestamp.
Transition: given a state at time t0, S(t0), and a time t1 > t0, Transition(S(t0),t0,t1) computes the S(t1). S(t1) will be a chat conversation history that is equal to S(t0) + an added list of conversation events with timestamp labels ti in the interval [t0,t1]
View: there might be many use cases in which the user will not interact directly by seeing the State as a chat history, or where having access to the  chat history is only part of the user experience. In this case the View, which might be a reactive app, will a function of State.

State to Props: For the reactive application case, the State2Props architecture will have a function State2Props that given State a time t, S(t), computes State2Props(S(t)) as object that is directly used as the props for the webapp.

## Integrity of Transition Condition
We require that the Transition function should maintain integrity and be deterministic.

Transition has Integrity if for ta < tb < tc, for which there is no user effect in the interval (ta,tc) it holds that

Transition(S(ta),ta,tc) = Transition(Transition(S(ta),ta,tb),tb,tc)

We then say that the Integrity of Transition Condition holds for the system.

For certain applications, depending on the complexity, integrity of transition might be a the most demanding part of designing and might be enforced using programming language theoretic approaches or comprehensive testing. In any case Integrity of Transition Tests might be a central part of implementing and maintaining such systems.

## Hash-based Integrity Checks
Given Integrity of Transition, we can at use Transition to compute S(t) = Transition(S(t0),t0,t1). In some applications one might imagine Transition being applied every N seconds, updating the state. Given hashes H(S(t)) for the different times for which Transition is being computes, the application itself or additional tooling for the application might check that Transition has Integrity, by checking the Integrity Equations for various triplets (ta,tb,tc).

## Practical Implementation
Once we now have the abstract description of the framework, the question is now how to best use these ideas within the context of an existing software application.

First, it is is clear that not every state S(ti) has to be stored independently as they form an expanding sequence of events.

However, unlike many chatbot applications, in which it might be possible to delete certain messages or remove older context, there are certain limitations in this situation.

We imagine that natural language messages from both user and assistant will have no effect on state, and that only tool requests, tool calls and system messages will determine transitions, which can be formalized if needed.

We thus might distinguish between consequential and inconsequential events in the sequence and thus we have an induced sequence of consequential events formed by only consequential events.

It might be beneficial to let the consequential sequence form a hash chain, for aiding in integrity and also potential branchability for training systems.

## Virtual Auxilliary State
Since S(t1) is uniquely defined by S(t0), t0, t1 and any intermediate effects in the interval t0 and t1, by means of Transition, one can imagine many different implementations of computing S(t1). One option is auxilliary state such as the maintenance of a data structure, eg a dictionary, list or even a git repository. As long as Transition is computable and upholds Integrity, the system might in pratice, for efficiency purposes, make use of data structures that help update from one state to the next. These data structures will be auxiliary state but virtual in the sense that they are not required and can always be computed from any prior state using Transition.

## Where is State stored and Transition computed?
Depending on the application, there might be reasons to keep State on the client or the server side and likewise with Transition. There are many relevant considerations, some of which are
* Most modern applications store persistent data server-side in a database, only using local browser databases for offline use cases. Many of the pros and cons of this kind of design are independent of the discussion of this architecture.
* One relevant aspect of the previous item is that the architecture is intended for temporally embedded applications, in which latency matters. However there are many subdesigns possible, with different ways or levels of synchronization between server and client State.
* The determinism of Transition means that accesses to non-deterministic state cannot be Consequential events. It might be that in order to make it easier for engineers to get used to the distinction between Consequential and Inconsequential events, computing Transition on the client might benefit from the limitations that the client has in terms of authorization etc.

## Towards a stronger framework
What has been presented so far is a quite abstract framework with only some considerations on implementation. For the ideas to be more useful and allow for more complex systems, it might be useful to build towards a specific implementation of a framework that includes certain types fitting together in a Runtime. Here I am imagining some kind of compiler-based setup. TypeScript could be a good option.
