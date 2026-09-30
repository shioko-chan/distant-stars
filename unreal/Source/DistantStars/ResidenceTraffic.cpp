#include "ResidenceTraffic.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "NativeSceneAssets.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
namespace
{
constexpr double Radius = 15000, Cap = -3.5, Ground = -240, Margin = 110;
double N(const TSharedPtr<FJsonObject> &O, const TCHAR *K)
{
    return O->GetNumberField(K);
}
double Wrap(double X, double Period)
{
    return FMath::Fmod(FMath::Fmod(X, Period) + Period, Period);
}
double Smooth(double X)
{
    X = FMath::Clamp(X, 0., 1.);
    return X * X * (3 - 2 * X);
}
double LineLength(const TSharedPtr<FJsonObject> &Line)
{
    return Line->GetStringField(TEXT("direction")) == TEXT("ring") ? 2 * PI * Radius : 24000 - Margin * 2;
}
FVector2D LinePoint(const TSharedPtr<FJsonObject> &Line, double Distance)
{
    return Line->GetStringField(TEXT("direction")) == TEXT("ring")
               ? FVector2D(Wrap(Distance + PI * Radius, 2 * PI * Radius) - PI * Radius, N(Line, TEXT("at")))
               : FVector2D(N(Line, TEXT("at")), Cap + Margin + Distance);
}
FVector2D Train(const TSharedPtr<FJsonObject> &Table, double Seconds)
{
    const double T = Wrap(Seconds, N(Table, TEXT("period")));
    const auto &Runs = Table->GetArrayField(TEXT("runs"));
    auto Run = Runs[0]->AsObject();
    for (const auto &V : Runs)
    {
        auto R = V->AsObject();
        if (N(R, TEXT("start")) <= T)
            Run = R;
        else
            break;
    }
    const double Local = T - N(Run, TEXT("start")), From = N(Run, TEXT("from")), To = N(Run, TEXT("to")),
                 Duration = N(Run, TEXT("duration"));
    double Distance = From, Lateral = N(Run, TEXT("after"));
    const FString Kind = Run->GetStringField(TEXT("kind"));
    if (Kind == TEXT("run"))
    {
        const double D = FMath::Abs(To - From), Peak = D >= 42 * 42 / 1.1 ? 42 : FMath::Sqrt(D * 1.1),
                     Ramp = Peak / 1.1;
        const double Covered = Local <= Ramp              ? .55 * Local * Local
                               : Local >= Duration - Ramp ? D - .55 * FMath::Square(Duration - Local)
                                                          : .55 * Ramp * Ramp + Peak * (Local - Ramp);
        Distance += FMath::Sign(To - From) * Covered;
    }
    else if (Kind == TEXT("terminal"))
        Lateral = FMath::Lerp(N(Run, TEXT("before")), Lateral, Smooth((Local / Duration - .3) / .4));
    const double Loop = N(Table, TEXT("loop"));
    return FVector2D(Loop ? Wrap(Distance, Loop) : Distance, Lateral);
}
} // namespace
bool FResidenceTraffic::Load()
{
    FString Raw;
    return FFileHelper::LoadFileToString(Raw,
                                         *(FPaths::ProjectContentDir() / TEXT("SceneData/traffic.json"))) &&
           FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Raw), Data);
}
void FResidenceTraffic::Bind(const FString &Name, int32 MotionIndex,
                             UInstancedStaticMeshComponent *Mesh, int32 InstanceIndex)
{
    auto &List = Bindings.FindOrAdd(Name);
    if (List.Num() <= MotionIndex)
        List.SetNum(MotionIndex + 1);
    List[MotionIndex] = {Mesh, InstanceIndex};
}
void FResidenceTraffic::Place(const FString &Name, int32 Index, double Arc, double Height, double Axial,
                              const FVector &Size, double Heading)
{
    auto *List = Bindings.Find(Name);
    if (!List || !List->IsValidIndex(Index))
        return;
    const auto &Binding = (*List)[Index];
    auto *Mesh = Binding.Mesh.Get();
    if (!Mesh)
        return;
    const double Angle = Arc / Radius, R = Radius - Height;
    const FVector Position(R * FMath::Sin(Angle), Radius - R * FMath::Cos(Angle), Axial);
    const FQuat Source = FQuat(FVector(0, 0, 1), Angle) * FQuat(FVector(0, 1, 0), Heading),
                Rotation(Source.Z, -Source.X, -Source.Y, Source.W);
    Mesh->UpdateInstanceTransform(
        Binding.Index,
        FTransform(Rotation, DistantStars::ToNative(Position), FVector(Size.Z, Size.X, Size.Y)), false, false,
        true);
}
void FResidenceTraffic::Tick(double Seconds)
{
    if (!Data)
        return;
    int32 TrainIndex = 0;
    for (const auto &Value : Data->GetArrayField(TEXT("trains")))
    {
        auto T = Value->AsObject(), Line = T->GetObjectField(TEXT("line"));
        const auto S = Train(T->GetObjectField(TEXT("table")), Seconds + N(T, TEXT("offset")));
        const bool Ring = Line->GetStringField(TEXT("direction")) == TEXT("ring");
        for (int32 C = 0; C < 4; C++)
        {
            auto P = LinePoint(Line, S.X + (C - 1.5) * 23.2);
            if (Ring)
                P.Y += S.Y * 2.7;
            else
                P.X += S.Y * 2.7;
            Place(TEXT("light-rail-cars"), TrainIndex * 4 + C, P.X, Ground + 72 + 2.2, P.Y,
                  FVector(3.1, 3.6, 22), Ring ? PI / 2 : 0);
            Place(TEXT("light-rail-windows"), TrainIndex * 4 + C, P.X, Ground + 72 + 2.6, P.Y,
                  FVector(3.16, .9, 20), Ring ? PI / 2 : 0);
        }
        TrainIndex++;
    }
    const auto Vehicle = [this](int32 I, double Arc, double Height, double Axial, double Heading,
                                double Size) {
        const double X = FMath::Sin(Heading) * 2.7 * Size, Z = FMath::Cos(Heading) * 2.7 * Size;
        Place(TEXT("flying-vehicles"), I, Arc, Height, Axial, FVector(2.2, .8, 5.2) * Size, Heading);
        Place(TEXT("flying-vehicle-lights"), I * 2, Arc - X, Height, Axial - Z, FVector(1.7, .25, .2) * Size,
              Heading);
        Place(TEXT("flying-vehicle-lights"), I * 2 + 1, Arc + X, Height, Axial + Z,
              FVector(1.9, .2, .2) * Size, Heading);
    };
    int32 FlyerIndex = 0;
    for (const auto &Value : Data->GetArrayField(TEXT("flyers")))
    {
        auto F = Value->AsObject(), Lane = F->GetObjectField(TEXT("lane")),
             Line = Lane->GetObjectField(TEXT("line"));
        const bool Ring = Line->GetStringField(TEXT("direction")) == TEXT("ring");
        const double Length = LineLength(Line),
                     Fraction = Wrap(Seconds * N(F, TEXT("speed")) / Length + N(F, TEXT("phase")), 1);
        const bool Forward = Ring ? N(Lane, TEXT("direction")) > 0 : Fraction < .5;
        const double Distance = Ring ? (Forward ? Fraction : 1 - Fraction) * Length
                                     : (Forward ? Fraction * 2 : 2 - Fraction * 2) * Length,
                     Weave = FMath::Sin(Distance / 650 + N(F, TEXT("weave"))),
                     Lateral = N(Lane, TEXT("offset")) + Weave * 5;
        auto P = LinePoint(Line, Distance);
        if (Ring)
            P.Y += Lateral;
        else
            P.X += Lateral;
        Vehicle(FlyerIndex++, P.X, Ground + N(Lane, TEXT("height")) + N(F, TEXT("jitter")) + Weave * 6, P.Y,
                Ring ? (Forward ? PI / 2 : -PI / 2) : (Forward ? 0 : PI), N(F, TEXT("size")));
    }
    for (const auto &Value : Data->GetArrayField(TEXT("routes")))
    {
        auto Route = Value->AsObject();
        const double T = Wrap(Seconds, N(Route, TEXT("period")));
        const auto &Frames = Route->GetArrayField(TEXT("keyframes"));
        int32 I = 0;
        while (I + 1 < Frames.Num() && N(Frames[I + 1]->AsObject(), TEXT("time")) <= T)
            I++;
        auto A = Frames[I]->AsObject(), B = Frames[FMath::Min(I + 1, Frames.Num() - 1)]->AsObject();
        const double Start = N(A, TEXT("time")), End = N(B, TEXT("time")),
                     E = Smooth(End > Start ? (T - Start) / (End - Start) : 0);
        const auto L = [&](const TCHAR *K) { return FMath::Lerp(N(A, K), N(B, K), E); };
        Vehicle(FlyerIndex++, L(TEXT("arc")), L(TEXT("height")) + .4, L(TEXT("axial")), L(TEXT("heading")),
                1.1);
    }
    // UpdateInstanceTransform records deltas in PrimitiveInstanceDataManager (UE 5.8).
    // End-of-frame instance updates upload these without replacing the scene proxy.
}
