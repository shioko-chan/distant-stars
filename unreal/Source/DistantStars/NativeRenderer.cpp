#include "NativeRenderer.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/Texture2D.h"
#include "GameFramework/Actor.h"
#include "ImageUtils.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/Paths.h"
#include "Misc/Crc.h"
#include "Serialization/JsonSerializer.h"
#include "NativeSceneAssets.h"
#include "ProceduralMeshComponent.h"

namespace
{
FVector V(const TSharedPtr<FJsonValue> &Value)
{
    const auto &A = Value->AsArray();
    return A.Num() == 3 ? FVector(A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber()) : FVector::ZeroVector;
}
FVector V(const TSharedPtr<FJsonObject> &Data, const TCHAR *Key)
{
    return V(Data->TryGetField(Key));
}
FLinearColor Color(const TSharedPtr<FJsonObject> &Data)
{
    FString S;
    return Data->TryGetStringField(TEXT("color"), S) ? FLinearColor(FColor::FromHex(S)) : FLinearColor::White;
}
} // namespace

bool UNativeRenderer::SetScene(const TSharedPtr<FJsonObject> &Data, FString &Error)
{
    for (auto &Pair : Objects)
        Pair.Value->DestroyComponent();
    Objects.Empty();
    ObjectSignatures.Empty();
    Mode = Data->GetStringField(TEXT("mode"));
    Units = Mode == TEXT("residence") ? 100 : Mode == TEXT("planet") ? 100000 : 1000;
    if (Mode == TEXT("residence") && !Residence)
    {
        Residence = NewObject<USceneComponent>(GetOwner());
        GetOwner()->AddInstanceComponent(Residence);
        Residence->SetupAttachment(this);
        Residence->RegisterComponent();
        if (!DistantStars::LoadResidence(GetOwner(), Residence, Traffic, Error))
        {
            TArray<USceneComponent *> Children;
            Residence->GetChildrenComponents(true, Children);
            for (auto Child : Children)
                Child->DestroyComponent();
            Residence->DestroyComponent();
            Residence = nullptr;
            return false;
        }
    }
    if (CatRoot)
        CatRoot->SetVisibility(Mode == TEXT("residence"), true);
    if (Residence)
        Residence->SetVisibility(Mode == TEXT("residence"), true);
    if(Mode==TEXT("galaxy")&&!Background)BuildBackground();
    if(Background)Background->SetVisibility(Mode==TEXT("galaxy"));
    UpdateObjects(Data, true);
    return true;
}
UMaterialInstanceDynamic *UNativeRenderer::Material(const TSharedPtr<FJsonObject> &Data)
{
    bool Unlit = false;
    Data->TryGetBoolField(TEXT("unlit"), Unlit);
    double Opacity = 1;
    Data->TryGetNumberField(TEXT("opacity"), Opacity);
    const TCHAR *Path = Opacity < 1 ? TEXT("/Game/Materials/M_SceneGlass")
                        : Unlit     ? TEXT("/Game/Materials/M_SceneUnlit")
                                    : TEXT("/Game/Materials/M_SceneLit");
    auto Result = UMaterialInstanceDynamic::Create(LoadObject<UMaterialInterface>(nullptr, Path), GetOwner());
    Result->SetVectorParameterValue(TEXT("Color"), Color(Data));
    Result->SetScalarParameterValue(TEXT("Opacity"), Opacity);
    Result->SetScalarParameterValue(TEXT("FlipY"), 0);
    FString Texture;
    if (Data->TryGetStringField(TEXT("texture"), Texture) &&
        (Texture.StartsWith(TEXT("/textures/")) || Texture.StartsWith(TEXT("/native/"))) &&
        !Texture.Contains(TEXT("..")))
    {
        auto *Found = Textures.Find(Texture);
        UTexture2D *Image = Found ? Found->Get() : nullptr;
        if (!Image)
        {
            Image = FImageUtils::ImportFileAsTexture2D(
                FPaths::ProjectContentDir() / (Texture.StartsWith(TEXT("/native/"))
                                                   ? FString(TEXT("SceneData")) / Texture.RightChop(8)
                                                   : FString(TEXT("Web")) / Texture.RightChop(1)));
            if (Image)
            {
                Image->SRGB = true;
                Image->AddressX = TA_Wrap;
                Image->AddressY = TA_Clamp;
                Image->UpdateResource();
                Textures.Add(Texture, Image);
            }
        }
        if (Image)
            Result->SetTextureParameterValue(TEXT("BaseTexture"), Image);
    }
    return Result;
}
void UNativeRenderer::UpdateObjects(const TSharedPtr<FJsonObject> &Data, bool Replace)
{
    const TArray<TSharedPtr<FJsonValue>> *Values = nullptr;
    TSet<FString> IDs;
    if (Data->TryGetArrayField(TEXT("objects"), Values))
        for (const auto &Value : *Values)
        {
            auto Object = Value->AsObject();
            if (!Object)
                continue;
            FString Id;
            if (!Object->TryGetStringField(TEXT("id"), Id))
                continue;
            IDs.Add(Id);
            PutObject(Object);
        }
    if (Replace)
    {
        TArray<FString> Remove;
        for (const auto &Pair : Objects)
            if (!IDs.Contains(Pair.Key) && !Pair.Key.StartsWith(TEXT("tile:")))
                Remove.Add(Pair.Key);
        for (const auto &Id : Remove)
        {
            Objects[Id]->DestroyComponent();
            Objects.Remove(Id);
            ObjectSignatures.Remove(Id);
        }
    }
    if (Data->TryGetArrayField(TEXT("remove"), Values))
        for (const auto &Value : *Values)
            if (auto *Object = Objects.Find(Value->AsString()))
            {
                (*Object)->DestroyComponent();
                Objects.Remove(Value->AsString());
                ObjectSignatures.Remove(Value->AsString());
            }
}
void UNativeRenderer::PutObject(const TSharedPtr<FJsonObject> &Data)
{
    const FString Id = Data->GetStringField(TEXT("id"));
    FString Serialized;
    FJsonSerializer::Serialize(Data.ToSharedRef(), TJsonWriterFactory<>::Create(&Serialized));
    const uint32 Signature = FCrc::StrCrc32(*Serialized);
    if (const auto *Previous = ObjectSignatures.Find(Id); Previous && *Previous == Signature)
        return;
    ObjectSignatures.Add(Id, Signature);
    TArray<FVector> Positions, Normals;
    TArray<int32> Indices;
    TArray<FVector2D> UV;
    double Radius = 0;
    const TArray<TSharedPtr<FJsonValue>> *Values = nullptr;
    if (Data->TryGetNumberField(TEXT("radius"), Radius))
    {
        const FVector Center = V(Data, TEXT("position"));
        constexpr int32 W = 48, H = 24;
        for (int32 Y = 0; Y <= H; ++Y)
            for (int32 X = 0; X <= W; ++X)
            {
                const double Latitude = (.5 - double(Y) / H) * PI, Longitude = (double(X) / W - .5) * 2 * PI;
                const FVector N(FMath::Cos(Latitude) * FMath::Cos(Longitude), FMath::Sin(Latitude),
                                -FMath::Cos(Latitude) * FMath::Sin(Longitude));
                Positions.Add(DistantStars::ToNative(Center + N * Radius, Units));
                Normals.Add(DistantStars::ToNative(N, 1));
                UV.Add(FVector2D(double(X) / W, double(Y) / H));
            }
        for (int32 Y = 0; Y < H; ++Y)
            for (int32 X = 0; X < W; ++X)
            {
                const int32 A = Y * (W + 1) + X, B = A + 1, C = A + W + 1, D = C + 1;
                Indices.Append({A, C, B, B, C, D});
            }
    }
    else if (Data->TryGetArrayField(TEXT("points"), Values))
    {
        double Width = .01;
        Data->TryGetNumberField(TEXT("width"), Width);
        for (int32 I = 1; I < Values->Num(); ++I)
        {
            const FVector A = DistantStars::ToNative(V((*Values)[I - 1]), Units),
                          B = DistantStars::ToNative(V((*Values)[I]), Units), Axis = (B - A).GetSafeNormal();
            if (Axis.IsNearlyZero())
                continue;
            FVector Side, Up;
            Axis.FindBestAxisVectors(Side, Up);
            const int32 Base = Positions.Num();
            constexpr int32 Sides = 5;
            for (int32 End = 0; End < 2; ++End)
                for (int32 J = 0; J < Sides; ++J)
                {
                    const FVector N =
                        Side * FMath::Cos(J * 2 * PI / Sides) + Up * FMath::Sin(J * 2 * PI / Sides);
                    Positions.Add((End ? B : A) + N * Width * Units * .5);
                    Normals.Add(N);
                    UV.Add(FVector2D(double(J) / Sides, End));
                }
            for (int32 J = 0; J < Sides; ++J)
            {
                int32 K = (J + 1) % Sides;
                Indices.Append(
                    {Base + J, Base + K, Base + J + Sides, Base + K, Base + K + Sides, Base + J + Sides});
            }
        }
    }
    else if (Data->TryGetArrayField(TEXT("positions"), Values))
    {
        if (Values->Num() % 3 || Values->Num() > 3000000)
            return;
        for (int32 I = 0; I < Values->Num(); I += 3)
            Positions.Add(DistantStars::ToNative(
                FVector((*Values)[I]->AsNumber(), (*Values)[I + 1]->AsNumber(), (*Values)[I + 2]->AsNumber()),
                Units));
        if (Data->TryGetArrayField(TEXT("indices"), Values))
        {
            if (Values->Num() % 3)
                return;
            for (int32 I = 0; I < Values->Num(); I += 3)
            {
                const int32 A = (*Values)[I]->AsNumber(), B = (*Values)[I + 1]->AsNumber(),
                            C = (*Values)[I + 2]->AsNumber();
                if (!Positions.IsValidIndex(A) || !Positions.IsValidIndex(B) || !Positions.IsValidIndex(C))
                    return;
                Indices.Append({A, B, C});
            }
        }
        if (Data->TryGetArrayField(TEXT("normals"), Values))
            for (int32 I = 0; I + 2 < Values->Num(); I += 3)
                Normals.Add(
                    DistantStars::ToNative(FVector((*Values)[I]->AsNumber(), (*Values)[I + 1]->AsNumber(),
                                                   (*Values)[I + 2]->AsNumber()),
                                           1));
        if (Data->TryGetArrayField(TEXT("uv"), Values))
            for (int32 I = 0; I + 1 < Values->Num(); I += 2)
                UV.Add(FVector2D((*Values)[I]->AsNumber(), (*Values)[I + 1]->AsNumber()));
    }
    if (Positions.IsEmpty())
        return;
    auto *Found = Objects.Find(Id);
    auto *Mesh = Found ? Found->Get() : nullptr;
    if (!Mesh)
    {
        Mesh = NewObject<UProceduralMeshComponent>(GetOwner());
        GetOwner()->AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(this);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->RegisterComponent();
        Objects.Add(Id, Mesh);
    }
    Mesh->CreateMeshSection_LinearColor(0, Positions, Indices, Normals, UV, TArray<FLinearColor>(),
                                        TArray<FProcMeshTangent>(), false);
    Mesh->SetMaterial(0, Material(Data));
}

void UNativeRenderer::UpdateCat(const TSharedPtr<FJsonObject> &Data)
{
    if (Mode != TEXT("residence"))
        return;
    if (!CatRoot)
    {
        CatRoot = NewObject<USceneComponent>(GetOwner());
        GetOwner()->AddInstanceComponent(CatRoot);
        CatRoot->SetupAttachment(this);
        CatRoot->RegisterComponent();
        CatIdle = LoadObject<UAnimSequence>(nullptr, TEXT("/Game/Cat/cat/SkeletalMeshes/catIdle"));
        CatWalk = LoadObject<UAnimSequence>(nullptr, TEXT("/Game/Cat/cat/SkeletalMeshes/catWalk"));
        for (const TCHAR *Path :
             {TEXT("/Game/Cat/cat/SkeletalMeshes/Object_7"), TEXT("/Game/Cat/cat/SkeletalMeshes/Object_8")})
        {
            auto Asset = LoadObject<USkeletalMesh>(nullptr, Path);
            if (!Asset)
                continue;
            auto Mesh = NewObject<USkeletalMeshComponent>(GetOwner());
            GetOwner()->AddInstanceComponent(Mesh);
            Mesh->SetupAttachment(CatRoot);
            Mesh->SetSkeletalMeshAsset(Asset);
            // glTF importer uses (x,z,y); our shared scene uses (-z,x,y).
            Mesh->SetRelativeRotation(FRotator(0, 90, 0));
            Mesh->SetRelativeScale3D(FVector(.8133370808162596));
            Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Mesh->RegisterComponent();
            Mesh->PlayAnimation(CatIdle, true);
            CatMeshes.Add(Mesh);
        }
    }
    CatRoot->SetWorldLocation(DistantStars::ToNative(V(Data, TEXT("position"))));
    CatRoot->SetWorldRotation(FRotator(0, -FMath::RadiansToDegrees(Data->GetNumberField(TEXT("yaw"))), 0));
    CatRoot->SetVisibility(Data->GetBoolField(TEXT("visible")), true);
    const bool Moving = Data->GetBoolField(TEXT("moving"));
    if (Moving != bCatMoving)
    {
        bCatMoving = Moving;
        for (auto Mesh : CatMeshes)
            Mesh->PlayAnimation(Moving ? CatWalk : CatIdle, true);
    }
}

void UNativeRenderer::BuildBackground()
{
    Background=NewObject<UProceduralMeshComponent>(GetOwner());
    GetOwner()->AddInstanceComponent(Background);
    Background->SetupAttachment(this);
    Background->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Background->RegisterComponent();
    TArray<FVector> Positions,Normals;
    TArray<int32> Indices;
    FRandomStream Random(71039);
    const TArray<FVector> Corners={FVector(1,1,1),FVector(-1,-1,1),FVector(-1,1,-1),FVector(1,-1,-1)};
    for(int32 I=0;I<4200;I++){
        const double Distance=65+Random.FRand()*40,Angle=Random.FRand()*2*PI;
        const FVector Center(FMath::Cos(Angle)*Distance,(Random.FRand()-.5)*95,FMath::Sin(Angle)*Distance);
        const int32 Offset=Positions.Num();
        for(const auto& Corner:Corners){Positions.Add(DistantStars::ToNative(Center+Corner*.035,1000));Normals.Add(DistantStars::ToNative(Corner.GetSafeNormal(),1));}
        for(const int32 Index:{0,1,2,0,3,1,0,2,3,1,3,2})Indices.Add(Offset+Index);
    }
    Background->CreateMeshSection_LinearColor(0,Positions,Indices,Normals,TArray<FVector2D>(),TArray<FLinearColor>(),TArray<FProcMeshTangent>(),false);
    auto Parameters=MakeShared<FJsonObject>();Parameters->SetStringField(TEXT("color"),TEXT("#91acc9"));Parameters->SetBoolField(TEXT("unlit"),true);
    Background->SetMaterial(0,Material(Parameters));
}
