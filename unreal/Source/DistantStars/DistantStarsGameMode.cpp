#include "DistantStarsGameMode.h"
#include "DistantStarsExperience.h"
#include "Engine/World.h"

ADistantStarsGameMode::ADistantStarsGameMode()
{
    DefaultPawnClass = nullptr;
}

void ADistantStarsGameMode::BeginPlay()
{
    Super::BeginPlay();
    GetWorld()->SpawnActor<ADistantStarsExperience>();
}
